// Turns chunk block data into sphere instances plus "sealer" quads.
//
// Every visible block becomes one instanced sphere (or a few ellipsoids for plants,
// torches and cactus). Neighbouring spheres only touch at single points, so the gaps
// between them would let you see into the unrendered interior of the terrain. To
// prevent that, each exposed face also emits a quad through the *centre plane* of the
// block. Together these quads form a closed surface that sits inside the spheres and
// is only visible through the gaps, where it is shaded as a dark crevice.

import { CHUNK, HEIGHT, WATER_DROP } from '../config.js';
import { B, BLOCKS, OPAQUE, HAS_PARTS, LIGHT } from '../blocks.js';

const P = CHUNK + 2; // padded width (-1 .. 16)
const PA = P * P; // padded layer size
const PH = HEIGHT + 2; // padded height (-1 .. HEIGHT)
const HP = CHUNK + 4; // padded sky-height map width (-2 .. 17)

const pad = new Uint8Array(PA * PH);
const skyPad = new Int16Array(HP * HP);

// Axis strides in the padded array: x, y, z.
const AX = [1, PA, P];
// Direction d: axis = d >> 1, sign = d & 1 ? -1 : +1. Order: +x -x +y -y +z -z.
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const OFF = DX.map((_, d) => DX[d] * AX[0] + DY[d] * AX[1] + DZ[d] * AX[2]);

// The 12 edge neighbours (offset + coordinates).
const EDGES = [];
for (let a = 0; a < 3; a++) {
  for (let b = a + 1; b < 3; b++) {
    for (const sa of [-1, 1]) {
      for (const sb of [-1, 1]) {
        const v = [0, 0, 0];
        v[a] = sa;
        v[b] = sb;
        EDGES.push({ off: v[0] * AX[0] + v[1] * AX[1] + v[2] * AX[2], dx: v[0], dy: v[1], dz: v[2] });
      }
    }
  }
}

class InstanceBuffer {
  constructor() {
    this.cap = 1024;
    this.alloc();
    this.count = 0;
  }

  alloc() {
    const pos = new Uint8Array(this.cap * 4);
    const aoA = new Uint8Array(this.cap * 4);
    const aoB = new Uint8Array(this.cap * 4);
    if (this.pos) {
      pos.set(this.pos);
      aoA.set(this.aoA);
      aoB.set(this.aoB);
    }
    this.pos = pos;
    this.aoA = aoA;
    this.aoB = aoB;
  }

  push(x, y, z, type, ao, light, shape) {
    if (this.count === this.cap) {
      this.cap *= 2;
      this.alloc();
    }
    const o = this.count * 4;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
    this.pos[o + 3] = type;
    this.aoA[o] = ao[0];
    this.aoA[o + 1] = ao[1];
    this.aoA[o + 2] = ao[2];
    this.aoA[o + 3] = ao[3];
    this.aoB[o] = ao[4];
    this.aoB[o + 1] = ao[5];
    this.aoB[o + 2] = light;
    this.aoB[o + 3] = shape;
    this.count++;
  }

  export() {
    const n = this.count * 4;
    return { count: this.count, pos: this.pos.slice(0, n), aoA: this.aoA.slice(0, n), aoB: this.aoB.slice(0, n) };
  }
}

const TRI = [0, 1, 2, 0, 2, 3]; // two triangles per quad

class QuadBuffer {
  constructor() {
    this.cap = 1024;
    this.count = 0;
    this.alloc();
  }

  alloc() {
    const position = new Float32Array(this.cap * 18);
    const data = new Uint8Array(this.cap * 24);
    if (this.position) {
      position.set(this.position);
      data.set(this.data);
    }
    this.position = position;
    this.data = data;
  }

  push(corners, type, light) {
    if (this.count === this.cap) {
      this.cap *= 2;
      this.alloc();
    }
    const p = this.position;
    let o = this.count * 18;
    for (let i = 0; i < 6; i++) {
      const c = TRI[i];
      p[o++] = corners[c * 3];
      p[o++] = corners[c * 3 + 1];
      p[o++] = corners[c * 3 + 2];
    }
    const d = this.data;
    let q = this.count * 24;
    for (let v = 0; v < 6; v++) {
      d[q++] = type;
      d[q++] = light;
      d[q++] = 0;
      d[q++] = 0;
    }
    this.count++;
  }

  export() {
    return {
      count: this.count * 6,
      position: this.position.slice(0, this.count * 18),
      data: this.data.slice(0, this.count * 24),
    };
  }
}

const solidBuf = new InstanceBuffer();
const deepBuf = new InstanceBuffer(); // pitch-dark cave blocks, only drawn near the player
const waterBuf = new InstanceBuffer();
const sealBuf = new QuadBuffer();
const deepSealBuf = new QuadBuffer();
const waterSealBuf = new QuadBuffer();
const ao = new Uint8Array(6);
const NO_AO = new Uint8Array(6);
const corners = new Float32Array(12);
let emitters = new Float32Array(64);
let emitterCount = 0;

function fillPad(world, cx, cz, top) {
  pad.fill(B.AIR, 0, Math.min(pad.length, (top + 3) * PA));
  pad.fill(B.BEDROCK, 0, PA); // y = -1
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ch = world.getChunk(cx + dx, cz + dz);
      if (!ch) continue;
      const x0 = dx < 0 ? CHUNK - 1 : 0;
      const x1 = dx > 0 ? 0 : CHUNK - 1;
      const z0 = dz < 0 ? CHUNK - 1 : 0;
      const z1 = dz > 0 ? 0 : CHUNK - 1;
      const b = ch.blocks;
      const ymax = Math.min(top, ch.maxY);
      for (let y = 0; y <= ymax; y++) {
        for (let z = z0; z <= z1; z++) {
          const src = (y * CHUNK + z) * CHUNK;
          const dst = (y + 1) * PA + (z + dz * CHUNK + 1) * P + 1 + dx * CHUNK;
          for (let x = x0; x <= x1; x++) pad[dst + x] = b[src + x];
        }
      }
      // Sky heights with a 2-column margin.
      for (let z = 0; z < CHUNK; z++) {
        const pz = z + dz * CHUNK;
        if (pz < -2 || pz > CHUNK + 1) continue;
        for (let x = 0; x < CHUNK; x++) {
          const px = x + dx * CHUNK;
          if (px < -2 || px > CHUNK + 1) continue;
          skyPad[(pz + 2) * HP + (px + 2)] = ch.skyHeight[z * CHUNK + x];
        }
      }
    }
  }
}

function gatherEmitters(world, cx, cz) {
  emitterCount = 0;
  const R = 16;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ch = world.getChunk(cx + dx, cz + dz);
      if (!ch || ch.emitters.length === 0) continue;
      const e = ch.emitters;
      for (let i = 0; i < e.length; i += 4) {
        const x = e[i] + dx * CHUNK;
        const z = e[i + 2] + dz * CHUNK;
        const r = e[i + 3];
        // Skip emitters whose light cannot reach this chunk.
        const ox = x < 0 ? -x : x > CHUNK ? x - CHUNK : 0;
        const oz = z < 0 ? -z : z > CHUNK ? z - CHUNK : 0;
        if (ox * ox + oz * oz > r * r || ox > R || oz > R) continue;
        if ((emitterCount + 1) * 4 > emitters.length) {
          const bigger = new Float32Array(emitters.length * 2);
          bigger.set(emitters);
          emitters = bigger;
        }
        const o = emitterCount * 4;
        emitters[o] = x + 0.5;
        emitters[o + 1] = e[i + 1] + 0.5;
        emitters[o + 2] = z + 0.5;
        emitters[o + 3] = r;
        emitterCount++;
      }
    }
  }
}

function columnLight(c, y) {
  const h = skyPad[c];
  if (y >= h) return 1;
  const v = 1 - 0.2 * (h - y);
  return v > 0 ? v : 0;
}

/** Approximate sky light (0..1) of the air cell at chunk-local (x, y, z). */
function skyAt(x, y, z) {
  const c = (z + 2) * HP + (x + 2);
  let s = columnLight(c, y);
  if (s < 1) {
    const n = Math.max(columnLight(c - 1, y), columnLight(c + 1, y), columnLight(c - HP, y), columnLight(c + HP, y)) * 0.8;
    if (n > s) s = n;
  }
  return s;
}

/** Block light (0..1) from nearby emitters at a chunk-local point. */
function torchAt(x, y, z) {
  let best = 0;
  for (let i = 0; i < emitterCount; i++) {
    const o = i * 4;
    const dx = x - emitters[o];
    const dy = y - emitters[o + 1];
    const dz = z - emitters[o + 2];
    const r = emitters[o + 3];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    const v = 1 - Math.sqrt(d2) / r;
    if (v > best) best = v;
  }
  return best;
}

function packLight(sky, torch) {
  return (Math.round(Math.min(1, sky) * 15) << 4) | Math.round(Math.min(1, torch) * 15);
}

function occlusion(p, d) {
  const base = p + OFF[d];
  const a = d >> 1;
  const u = AX[(a + 1) % 3];
  const v = AX[(a + 2) % 3];
  const occ =
    0.45 * OPAQUE[pad[base]] +
    0.1 * (OPAQUE[pad[base + u]] + OPAQUE[pad[base - u]] + OPAQUE[pad[base + v]] + OPAQUE[pad[base - v]]) +
    0.0375 * (OPAQUE[pad[base + u + v]] + OPAQUE[pad[base + u - v]] + OPAQUE[pad[base - u + v]] + OPAQUE[pad[base - u - v]]);
  return Math.round(occ * 255);
}

// Extent of a solid sealer quad towards tangent offset t (see header comment).
function solidExtent(p, t, dOff) {
  if (!OPAQUE[pad[p + t]]) return 0; // convex edge: stop at our centre line
  return OPAQUE[pad[p + t + dOff]] ? 1 : 0.5; // concave corner : flat continuation
}

function isAirLike(id) {
  return id !== B.WATER && !OPAQUE[id];
}

function waterExtent(p, t, dOff) {
  const n = pad[p + t];
  if (n === B.WATER) return isAirLike(pad[p + t + dOff]) ? 0.5 : 1;
  if (OPAQUE[n]) return 1;
  return 0;
}

function pushQuad(buf, x, y, z, d, eum, eup, evm, evp, type, light, yOff) {
  const a = d >> 1;
  const ua = (a + 1) % 3;
  const va = (a + 2) % 3;
  const cx = x + 0.5;
  const cy = y + 0.5 + yOff;
  const cz = z + 0.5;
  for (let k = 0; k < 4; k++) {
    const o = k * 3;
    corners[o] = cx;
    corners[o + 1] = cy;
    corners[o + 2] = cz;
    corners[o + ua] += k === 0 || k === 3 ? -eum : eup;
    corners[o + va] += k < 2 ? -evm : evp;
  }
  buf.push(corners, type, light);
}

function emitSeal(buf, p, x, y, z, d, type, light, extentFn, yOff) {
  const a = d >> 1;
  const u = AX[(a + 1) % 3];
  const v = AX[(a + 2) % 3];
  const dOff = OFF[d];
  pushQuad(
    buf, x, y, z, d,
    extentFn(p, -u, dOff), extentFn(p, u, dOff), extentFn(p, -v, dOff), extentFn(p, v, dOff),
    type, light, yOff,
  );
}

/**
 * Builds render data for one chunk. All 8 neighbouring chunks must be loaded.
 * Returns typed arrays ready to be uploaded as (instanced) buffer attributes.
 */
export function meshChunk(world, chunk) {
  const { cx, cz } = chunk;
  let top = chunk.maxY;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ch = world.getChunk(cx + dx, cz + dz);
      if (ch && ch.maxY > top) top = ch.maxY;
    }
  }
  top = Math.min(HEIGHT - 1, top + 1);
  fillPad(world, cx, cz, top);
  gatherEmitters(world, cx, cz);

  solidBuf.count = 0;
  deepBuf.count = 0;
  waterBuf.count = 0;
  sealBuf.count = 0;
  deepSealBuf.count = 0;
  waterSealBuf.count = 0;
  let minY = HEIGHT;
  let maxY = 0;

  const ymax = chunk.maxY;
  for (let y = 0; y <= ymax; y++) {
    for (let z = 0; z < CHUNK; z++) {
      let p = (y + 1) * PA + (z + 1) * P + 1;
      for (let x = 0; x < CHUNK; x++, p++) {
        const b = pad[p];
        if (b === B.AIR) continue;

        if (b === B.WATER) {
          let mask = 0;
          for (let d = 0; d < 6; d++) if (isAirLike(pad[p + OFF[d]])) mask |= 1 << d;
          if (!mask) continue;
          const light = packLight(skyAt(x, y + 1, z), torchAt(x + 0.5, y + 1.5, z + 0.5));
          waterBuf.push(x, y, z, B.WATER, NO_AO, light, 0);
          for (let d = 0; d < 6; d++) {
            if (mask & (1 << d)) emitSeal(waterSealBuf, p, x, y, z, d, B.WATER, light, waterExtent, -WATER_DROP);
          }
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          continue;
        }

        if (HAS_PARTS[b]) {
          const parts = BLOCKS[b].parts;
          const light = packLight(skyAt(x, y, z), LIGHT[b] ? 1 : torchAt(x + 0.5, y + 0.5, z + 0.5));
          if (b === B.CACTUS) {
            for (let d = 0; d < 6; d++) ao[d] = occlusion(p, d);
          } else {
            ao.fill(0);
            ao[3] = OPAQUE[pad[p - PA]] ? 150 : 0;
          }
          const target = light === 0 ? deepBuf : solidBuf;
          for (const [shape, type] of parts) target.push(x, y, z, type, ao, light, shape);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          continue;
        }

        let mask = 0;
        for (let d = 0; d < 6; d++) if (!OPAQUE[pad[p + OFF[d]]]) mask |= 1 << d;
        let sky = 0;
        let torch = 0;
        if (mask) {
          for (let d = 0; d < 6; d++) {
            if (!(mask & (1 << d))) continue;
            const s = skyAt(x + DX[d], y + DY[d], z + DZ[d]);
            if (s > sky) sky = s;
          }
        } else {
          let visible = false;
          for (let e = 0; e < EDGES.length; e++) {
            const E = EDGES[e];
            if (OPAQUE[pad[p + E.off]]) continue;
            visible = true;
            const s = skyAt(x + E.dx, y + E.dy, z + E.dz) * 0.85;
            if (s > sky) sky = s;
          }
          if (!visible) continue;
        }
        torch = LIGHT[b] ? 1 : torchAt(x + 0.5, y + 0.5, z + 0.5);
        const light = packLight(sky, torch);
        for (let d = 0; d < 6; d++) ao[d] = occlusion(p, d);
        const deep = light === 0;
        (deep ? deepBuf : solidBuf).push(x, y, z, b, ao, light, 0);
        const quads = deep ? deepSealBuf : sealBuf;
        for (let d = 0; d < 6; d++) {
          if (mask & (1 << d)) emitSeal(quads, p, x, y, z, d, b, light, solidExtent, 0);
        }
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    solid: solidBuf.export(),
    deep: deepBuf.export(),
    water: waterBuf.export(),
    seal: sealBuf.export(),
    deepSeal: deepSealBuf.export(),
    waterSeal: waterSealBuf.export(),
    minY: minY > maxY ? 0 : minY,
    maxY,
  };
}
