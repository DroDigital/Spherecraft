// Procedural terrain: rolling hills, ridged mountains with stone cliffs, rivers,
// beaches, deserts, snowy peaks, caves, ore veins, trees and plants.

import { CHUNK, HEIGHT, SEA_LEVEL, CHUNK_VOLUME, blockIndex } from '../config.js';
import { B } from '../blocks.js';
import { Simplex, hash2, hash3, mulberry32, smoothstep, lerp } from './noise.js';

const MARGIN = 5; // columns sampled around the chunk (slopes + trees crossing borders)
const HM = CHUNK + MARGIN * 2;
const TREE_CELL = 6;
const TREE_REACH = 4;

const TREE = { NONE: 0, OAK: 1, BIRCH: 2, SPRUCE: 3, CACTUS: 4 };

const CAVE_STEP = 4;
const CAVE_NX = CHUNK / CAVE_STEP + 1;
const CAVE_NY = HEIGHT / CAVE_STEP + 1;

export class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    const s = this.seed;
    const noise = (k) => new Simplex((s ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0);
    this.nCont = noise(1);
    this.nHill = noise(2);
    this.nDetail = noise(3);
    this.nMask = noise(4);
    this.nRidge = noise(5);
    this.nRiver = noise(6);
    this.nTemp = noise(7);
    this.nHum = noise(8);
    this.nCave1 = noise(9);
    this.nCave2 = noise(10);
    this.nCave3 = noise(11);
    this.nPatch = noise(12);

    // Scratch buffers reused for every chunk.
    this.hm = new Int16Array(HM * HM);
    this.surface = new Uint8Array(HM * HM);
    this.sub = new Uint8Array(HM * HM);
    this.subDepth = new Uint8Array(HM * HM);
    this.treeKind = new Uint8Array(HM * HM);
    this.treeDensity = new Float32Array(HM * HM);
    this.grassChance = new Float32Array(HM * HM);
    this.cave1 = new Float32Array(CAVE_NX * CAVE_NX * CAVE_NY);
    this.cave2 = new Float32Array(CAVE_NX * CAVE_NX * CAVE_NY);
    this.cave3 = new Float32Array(CAVE_NX * CAVE_NX * CAVE_NY);
  }

  /** Terrain height (y of the topmost solid block) for a world column. */
  heightAt(x, z) {
    const cont = this.nCont.fbm2(x * 0.0017, z * 0.0017, 4);
    const hills = this.nHill.fbm2(x * 0.0075, z * 0.0075, 4);
    const detail = this.nDetail.noise2(x * 0.045, z * 0.045);
    const mask = smoothstep(0.02, 0.45, this.nMask.fbm2(x * 0.0021 + 31.7, z * 0.0021 - 12.3, 3));
    const r = 1 - Math.abs(this.nRidge.fbm2(x * 0.0065, z * 0.0065, 4));
    const ridge = r * r;
    let h = SEA_LEVEL + 3 + cont * 18 + hills * (5 + 5 * mask) + detail * 1.3 + mask * (ridge * 38 + 5);

    // Rivers carve valleys (and canyons through mountains).
    const rv = Math.abs(this.nRiver.fbm2(x * 0.0019 + 400, z * 0.0019 - 250, 3));
    const width = 0.055;
    if (rv < width) {
      const t = smoothstep(0.18, 1, rv / width);
      const bed = SEA_LEVEL - 3 - (1 - t) * 1.5;
      h = Math.min(h, lerp(bed, h, t));
    }
    return Math.max(3, Math.min(HEIGHT - 14, Math.round(h)));
  }

  /** Cheap surface query used for spawn selection. */
  columnInfo(x, z) {
    const h = this.heightAt(x, z);
    return { height: h, underwater: h < SEA_LEVEL };
  }

  generate(cx, cz) {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const seed = this.seed;

    this.springs = []; // world coords of generated waterfalls, handed to the fluid simulation
    this._sampleColumns(x0, z0);
    this._fillTerrain(blocks, x0, z0);
    this._carveCaves(blocks, x0, z0);
    this._placeOres(blocks, cx, cz);
    this._placeWaterfalls(blocks, x0, z0);
    this._placeTrees(blocks, x0, z0);
    this._placePlants(blocks, x0, z0, seed);
    return blocks;
  }

  _sampleColumns(x0, z0) {
    const { hm } = this;
    for (let k = 0; k < HM; k++) {
      for (let i = 0; i < HM; i++) {
        hm[k * HM + i] = this.heightAt(x0 - MARGIN + i, z0 - MARGIN + k);
      }
    }
    for (let k = 0; k < HM; k++) {
      for (let i = 0; i < HM; i++) {
        const c = k * HM + i;
        const wx = x0 - MARGIN + i;
        const wz = z0 - MARGIN + k;
        const h = hm[c];
        const il = i > 0 ? c - 1 : c;
        const ir = i < HM - 1 ? c + 1 : c;
        const kl = k > 0 ? c - HM : c;
        const kr = k < HM - 1 ? c + HM : c;
        const slope = Math.max(
          Math.abs(hm[ir] - h), Math.abs(hm[il] - h), Math.abs(hm[kr] - h), Math.abs(hm[kl] - h),
        );
        const patch = this.nPatch.noise2(wx * 0.08, wz * 0.08);
        const temp = this.nTemp.fbm2(wx * 0.0011, wz * 0.0011, 2) - Math.max(0, h - SEA_LEVEL - 18) * 0.014;
        const hum = this.nHum.fbm2(wx * 0.0013 + 50, wz * 0.0013 + 50, 2);
        const snowLine = SEA_LEVEL + 41 + patch * 3;

        let surface = B.GRASS;
        let sub = B.DIRT;
        let subDepth = 3 + (patch > 0 ? 1 : 0);
        let treeKind = TREE.OAK;
        let density = 0.1 + smoothstep(-0.1, 0.4, hum) * 0.75;
        let grass = 0.12 + smoothstep(-0.3, 0.3, hum) * 0.12;

        if (h < SEA_LEVEL - 1) {
          surface = patch > 0.45 ? B.GRAVEL : patch < -0.55 ? B.CLAY : B.SAND;
          sub = B.SAND;
          treeKind = TREE.NONE;
          grass = 0;
        } else if (temp > 0.28 && hum < 0.05) {
          surface = B.SAND;
          sub = B.SAND;
          subDepth = 3;
          treeKind = TREE.CACTUS;
          density = 0.22;
          grass = 0;
        } else if (h <= SEA_LEVEL + 1) {
          surface = B.SAND;
          sub = B.SAND;
          treeKind = TREE.NONE;
          grass = 0.02;
        } else if (slope >= 3 || (slope >= 2 && h > SEA_LEVEL + 26)) {
          surface = B.STONE;
          sub = B.STONE;
          treeKind = TREE.NONE;
          grass = 0;
        } else if (h > snowLine) {
          surface = B.SNOW;
          sub = B.STONE;
          subDepth = 1;
          treeKind = h < snowLine + 6 ? TREE.SPRUCE : TREE.NONE;
          density = 0.2;
          grass = 0;
        } else if (temp < -0.32) {
          surface = B.SNOW;
          treeKind = TREE.SPRUCE;
          density = 0.25 + smoothstep(-0.1, 0.4, hum) * 0.5;
          grass = 0;
        } else if (temp < -0.15 || h > SEA_LEVEL + 24) {
          treeKind = TREE.SPRUCE;
          density *= 0.8;
        } else if (hum > 0.3 && temp < 0.15) {
          treeKind = TREE.BIRCH;
        }

        this.surface[c] = surface;
        this.sub[c] = sub;
        this.subDepth[c] = subDepth;
        this.treeKind[c] = treeKind;
        this.treeDensity[c] = density;
        this.grassChance[c] = grass;
      }
    }
  }

  _fillTerrain(blocks, x0, z0) {
    const seed = this.seed;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const c = (z + MARGIN) * HM + (x + MARGIN);
        const h = this.hm[c];
        const surface = this.surface[c];
        const sub = this.sub[c];
        const subDepth = this.subDepth[c];
        const top = Math.max(h, SEA_LEVEL);
        for (let y = 0; y <= top; y++) {
          let id;
          if (y === 0 || (y < 3 && hash3(x0 + x, y, z0 + z, seed) < 0.5)) id = B.BEDROCK;
          else if (y > h) id = B.WATER;
          else if (y === h) id = surface;
          else if (y >= h - subDepth) id = sub;
          else if (surface === B.SAND && sub === B.SAND && y >= h - subDepth - 4 && h >= SEA_LEVEL) id = B.SANDSTONE;
          else id = B.STONE;
          blocks[blockIndex(x, y, z)] = id;
        }
      }
    }
  }

  _carveCaves(blocks, x0, z0) {
    const { cave1, cave2, cave3 } = this;
    let n = 0;
    for (let gy = 0; gy < CAVE_NY; gy++) {
      for (let gz = 0; gz < CAVE_NX; gz++) {
        for (let gx = 0; gx < CAVE_NX; gx++) {
          const wx = x0 + gx * CAVE_STEP;
          const wy = gy * CAVE_STEP;
          const wz = z0 + gz * CAVE_STEP;
          cave1[n] = this.nCave1.noise3(wx * 0.021, wy * 0.034, wz * 0.021);
          cave2[n] = this.nCave2.noise3(wx * 0.021 + 97.3, wy * 0.034, wz * 0.021 - 41.9);
          cave3[n] = this.nCave3.noise3(wx * 0.011, wy * 0.02, wz * 0.011);
          n++;
        }
      }
    }
    const inv = 1 / CAVE_STEP;
    const sy = CAVE_NX * CAVE_NX;
    for (let z = 0; z < CHUNK; z++) {
      const gz = (z * inv) | 0;
      const fz = z * inv - gz;
      for (let x = 0; x < CHUNK; x++) {
        const gx = (x * inv) | 0;
        const fx = x * inv - gx;
        const c = (z + MARGIN) * HM + (x + MARGIN);
        const h = this.hm[c];
        const wet = h < SEA_LEVEL + 2;
        const maxY = wet ? h - 6 : h;
        for (let y = 2; y <= maxY; y++) {
          const gy = (y * inv) | 0;
          const fy = y * inv - gy;
          const i000 = gy * sy + gz * CAVE_NX + gx;
          const a = trilinear(cave1, i000, sy, fx, fy, fz);
          const b = trilinear(cave2, i000, sy, fx, fy, fz);
          let carve = a * a + b * b < (y < 20 ? 0.016 : 0.011);
          if (!carve && y < h - 8 && y < 44) {
            const cv = trilinear(cave3, i000, sy, fx, fy, fz);
            carve = cv > 0.6 - (y < 24 ? 0.06 : 0);
          }
          if (carve) {
            const i = blockIndex(x, y, z);
            if (blocks[i] !== B.BEDROCK && blocks[i] !== B.WATER) blocks[i] = B.AIR;
          }
        }
      }
    }
  }

  _placeOres(blocks, cx, cz) {
    const rand = mulberry32(Math.floor(hash2(cx, cz, this.seed ^ 0x51ed27) * 4294967296));
    const veins = [
      [B.COAL_ORE, 14, 9, 5, 78],
      [B.IRON_ORE, 9, 6, 4, 56],
      [B.GOLD_ORE, 3, 5, 4, 30],
      [B.DIAMOND_ORE, 2, 4, 2, 15],
      [B.GRAVEL, 3, 12, 8, 60],
    ];
    for (const [id, count, size, ymin, ymax] of veins) {
      for (let v = 0; v < count; v++) {
        let x = Math.floor(rand() * CHUNK);
        let y = ymin + Math.floor(rand() * (ymax - ymin));
        let z = Math.floor(rand() * CHUNK);
        const len = Math.max(1, Math.floor(size * (0.5 + rand() * 0.5)));
        for (let s = 0; s < len; s++) {
          const i = blockIndex(x, y, z);
          if (blocks[i] === B.STONE) blocks[i] = id;
          x = Math.min(CHUNK - 1, Math.max(0, x + Math.floor(rand() * 3) - 1));
          y = Math.min(HEIGHT - 1, Math.max(1, y + Math.floor(rand() * 3) - 1));
          z = Math.min(CHUNK - 1, Math.max(0, z + Math.floor(rand() * 3) - 1));
        }
      }
    }
  }

  /** Springs in stone cliffs that pour a column of water down the cliff face. */
  _placeWaterfalls(blocks, x0, z0) {
    const seed = this.seed;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let z = 1; z < CHUNK - 1; z++) {
      for (let x = 1; x < CHUNK - 1; x++) {
        const c = (z + MARGIN) * HM + (x + MARGIN);
        const h = this.hm[c];
        if (this.surface[c] !== B.STONE || h < SEA_LEVEL + 6) continue;
        if (hash2(x0 + x, z0 + z, seed ^ 0x5f3759df) > 0.02) continue;
        let low = null;
        for (const [dx, dz] of dirs) {
          const hn = this.hm[c + dz * HM + dx];
          if (!low || hn < low.h) low = { dx, dz, h: hn };
        }
        if (h - low.h < 5) continue;
        const fx = x + low.dx;
        const fz = z + low.dz;
        if (blocks[blockIndex(x, h, z)] === B.AIR) continue; // carved by a cave
        blocks[blockIndex(x, h, z)] = B.WATER;
        for (let y = h; y > low.h; y--) {
          const i = blockIndex(fx, y, fz);
          if (blocks[i] === B.AIR) blocks[i] = B.WATER_FALL;
        }
        this.springs.push(x0 + x, h, z0 + z, x0 + fx, low.h + 1, z0 + fz);
      }
    }
  }

  _placeTrees(blocks, x0, z0) {
    const seed = this.seed;
    const gx0 = Math.floor((x0 - TREE_REACH) / TREE_CELL);
    const gx1 = Math.floor((x0 + CHUNK - 1 + TREE_REACH) / TREE_CELL);
    const gz0 = Math.floor((z0 - TREE_REACH) / TREE_CELL);
    const gz1 = Math.floor((z0 + CHUNK - 1 + TREE_REACH) / TREE_CELL);

    const set = (wx, wy, wz, id, force) => {
      const lx = wx - x0;
      const lz = wz - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || wy < 1 || wy >= HEIGHT) return;
      const i = blockIndex(lx, wy, lz);
      const cur = blocks[i];
      if (cur === B.AIR || (force && (cur === B.OAK_LEAVES || cur === B.BIRCH_LEAVES || cur === B.SPRUCE_LEAVES))) {
        blocks[i] = id;
      }
    };

    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const tx = gx * TREE_CELL + 1 + Math.floor(hash2(gx, gz, seed ^ 0x2545f491) * (TREE_CELL - 2));
        const tz = gz * TREE_CELL + 1 + Math.floor(hash2(gx, gz, seed ^ 0x68e31da4) * (TREE_CELL - 2));
        const li = tx - x0 + MARGIN;
        const lk = tz - z0 + MARGIN;
        if (li < 1 || li >= HM - 1 || lk < 1 || lk >= HM - 1) continue;
        const c = lk * HM + li;
        const kind = this.treeKind[c];
        if (kind === TREE.NONE) continue;
        if (hash2(gx, gz, seed ^ 0x1b873593) >= this.treeDensity[c]) continue;
        const h = this.hm[c];
        if (h < SEA_LEVEL + 1) continue;
        // Don't plant trees over cave mouths carved into this chunk.
        const lx = tx - x0;
        const lz = tz - z0;
        if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK && blocks[blockIndex(lx, h, lz)] === B.AIR) continue;

        const rand = mulberry32(Math.floor(hash2(tx, tz, seed ^ 0x7f4a7c15) * 4294967296));
        const base = h + 1;
        if (kind === TREE.CACTUS) {
          const hgt = 1 + Math.floor(rand() * 3);
          for (let y = 0; y < hgt; y++) set(tx, base + y, tz, B.CACTUS, false);
        } else if (kind === TREE.SPRUCE) {
          const hgt = 7 + Math.floor(rand() * 4);
          for (let y = 0; y < hgt; y++) set(tx, base + y, tz, B.SPRUCE_LOG, true);
          const bottom = base + 2;
          const top = base + hgt;
          for (let y = bottom; y <= top; y++) {
            const f = (y - bottom) / (top - bottom);
            const r = (1 - f) * 2.9 + 0.35 + ((y - bottom) % 2 === 0 ? 0.35 : -0.2);
            const ri = Math.ceil(r);
            for (let dz = -ri; dz <= ri; dz++) {
              for (let dx = -ri; dx <= ri; dx++) {
                if (dx * dx + dz * dz <= r * r) set(tx + dx, y, tz + dz, B.SPRUCE_LEAVES, false);
              }
            }
          }
          set(tx, top + 1, tz, B.SPRUCE_LEAVES, false);
        } else {
          const birch = kind === TREE.BIRCH && rand() < 0.75;
          const big = !birch && rand() < 0.12;
          const log = birch ? B.BIRCH_LOG : B.OAK_LOG;
          const leaves = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
          const hgt = big ? 8 + Math.floor(rand() * 3) : birch ? 6 + Math.floor(rand() * 2) : 5 + Math.floor(rand() * 3);
          const R = big ? 3.5 + rand() * 0.5 : birch ? 2.1 + rand() * 0.3 : 2.4 + rand() * 0.6;
          const stretch = birch ? 0.72 : 1.1;
          for (let y = 0; y < hgt; y++) set(tx, base + y, tz, log, true);
          const cy = base + hgt - (birch ? 0 : 0.5);
          const ri = Math.ceil(R);
          const rv = Math.ceil(R / stretch);
          for (let dy = -rv; dy <= rv; dy++) {
            for (let dz = -ri; dz <= ri; dz++) {
              for (let dx = -ri; dx <= ri; dx++) {
                const wy = Math.round(cy + dy);
                const ddy = (wy - cy) * stretch;
                const d2 = dx * dx + ddy * ddy + dz * dz;
                if (d2 > R * R) continue;
                if (d2 > (R - 0.8) * (R - 0.8) && hash3(tx + dx, wy, tz + dz, seed ^ 0x3c6ef372) < 0.3) continue;
                set(tx + dx, wy, tz + dz, leaves, false);
              }
            }
          }
        }
      }
    }
  }

  _placePlants(blocks, x0, z0, seed) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const c = (z + MARGIN) * HM + (x + MARGIN);
        const chance = this.grassChance[c];
        if (chance <= 0) continue;
        const h = this.hm[c];
        if (h + 1 >= HEIGHT) continue;
        const ground = blocks[blockIndex(x, h, z)];
        if (ground !== B.GRASS && ground !== B.SAND) continue;
        if (blocks[blockIndex(x, h + 1, z)] !== B.AIR) continue;
        const r = hash2(x0 + x, z0 + z, seed ^ 0x6a09e667);
        if (ground === B.SAND) {
          if (r < chance * 0.3) blocks[blockIndex(x, h + 1, z)] = B.TALL_GRASS;
          continue;
        }
        if (r < chance) blocks[blockIndex(x, h + 1, z)] = B.TALL_GRASS;
        else if (r > 0.9975) blocks[blockIndex(x, h + 1, z)] = B.PUMPKIN;
        else if (r < chance + 0.018) {
          blocks[blockIndex(x, h + 1, z)] = hash2(x0 + x, z0 + z, seed ^ 0x3243f6a8) < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW;
        }
      }
    }
  }
}

function trilinear(arr, i000, sy, fx, fy, fz) {
  const sz = CAVE_NX;
  const c000 = arr[i000];
  const c100 = arr[i000 + 1];
  const c010 = arr[i000 + sz];
  const c110 = arr[i000 + sz + 1];
  const c001 = arr[i000 + sy];
  const c101 = arr[i000 + sy + 1];
  const c011 = arr[i000 + sy + sz];
  const c111 = arr[i000 + sy + sz + 1];
  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;
  const z0 = x00 + (x10 - x00) * fz;
  const z1 = x01 + (x11 - x01) * fz;
  return z0 + (z1 - z0) * fy;
}
