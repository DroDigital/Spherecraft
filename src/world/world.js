// Chunked block storage, player edits and per-chunk lighting metadata.

import { CHUNK, HEIGHT, CHUNK_VOLUME, MAX_LIGHT_RADIUS, blockIndex, chunkKey } from '../config.js';
import { B, LIGHT, SKY_BLOCKING, SOLID, GROWS } from '../blocks.js';
import { WorldGen } from './worldgen.js';

export class Chunk {
  /** Builds a chunk from data already computed elsewhere (a worker). */
  static fromData(d) {
    const c = Object.create(Chunk.prototype);
    c.cx = d.cx;
    c.cz = d.cz;
    c.key = chunkKey(d.cx, d.cz);
    c.blocks = d.blocks;
    c.skyHeight = d.skyHeight;
    c.maxY = d.maxY;
    c.emitters = d.emitters;
    c.growables = d.growables;
    c.springs = d.springs;
    c.dirty = true;
    c.meshed = false;
    c.version = 0;
    return c;
  }

  constructor(cx, cz, blocks) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = blocks;
    // Per column: 1 + y of the highest sky-blocking block (0 = open to the bottom).
    this.skyHeight = new Uint8Array(CHUNK * CHUNK);
    this.maxY = 0;
    // Light emitters as flat [x, y, z, radius] in chunk-local coordinates.
    this.emitters = [];
    this.dirty = true;
    this.meshed = false;
    this.version = 0;
    this.recomputeMeta();
  }

  recomputeMeta() {
    const b = this.blocks;
    let maxY = 0;
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) this.updateColumn(x, z);
    }
    // Highest non-air block.
    for (let i = CHUNK_VOLUME - 1; i >= 0; i--) {
      if (b[i] !== B.AIR) {
        maxY = Math.floor(i / (CHUNK * CHUNK));
        break;
      }
    }
    this.maxY = maxY;
    this.rebuildEmitters();
  }

  updateColumn(x, z) {
    const b = this.blocks;
    let h = 0;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      if (SKY_BLOCKING[b[blockIndex(x, y, z)]]) {
        h = y + 1;
        break;
      }
    }
    this.skyHeight[z * CHUNK + x] = h;
  }

  rebuildEmitters() {
    const b = this.blocks;
    const out = [];
    const grow = [];
    const top = Math.min(HEIGHT - 1, this.maxY);
    for (let y = 0; y <= top; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = b[blockIndex(x, y, z)];
          const l = LIGHT[id];
          if (l) out.push(x, y, z, l);
          if (GROWS.has(id)) grow.push(x, y, z);
        }
      }
    }
    this.emitters = out;
    this.growables = grow;
  }
}

export class World {
  constructor(seed, edits = new Map()) {
    this.seed = seed >>> 0;
    this.gen = new WorldGen(this.seed);
    this.chunks = new Map();
    this.edits = edits; // chunkKey -> Map(blockIndex -> id)
    this.dirty = new Set(); // chunk keys whose meshes need rebuilding
    this.editCount = 0;
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  hasChunk(cx, cz) {
    return this.chunks.has(chunkKey(cx, cz));
  }

  loadChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    const blocks = this.gen.generate(cx, cz);
    const edits = this.edits.get(key);
    if (edits) for (const [i, id] of edits) blocks[i] = id;
    chunk = new Chunk(cx, cz, blocks);
    chunk.springs = this.gen.springs;
    this.addChunk(chunk);
    return chunk;
  }

  /** Registers an already generated chunk (e.g. from a worker). */
  addChunk(chunk) {
    this.chunks.set(chunk.key, chunk);
    if (this.onChunkLoaded) this.onChunkLoaded(chunk);
    return chunk;
  }

  unloadChunk(key) {
    this.chunks.delete(key);
    this.dirty.delete(key);
  }

  /** True when the chunk and all 8 neighbours have block data (needed for meshing). */
  neighborsLoaded(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!chunk) return B.AIR;
    return chunk.blocks[blockIndex(x & 15, y, z & 15)];
  }

  isSolid(x, y, z) {
    return SOLID[this.getBlock(x, y, z)] === 1;
  }

  /** Sets a block, records it as an edit and marks affected chunk meshes dirty. */
  setBlock(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return false;
    const lx = x & 15;
    const lz = z & 15;
    const i = blockIndex(lx, y, lz);
    const old = chunk.blocks[i];
    if (old === id) return false;
    chunk.blocks[i] = id;

    let edits = this.edits.get(chunk.key);
    if (!edits) {
      edits = new Map();
      this.edits.set(chunk.key, edits);
    }
    edits.set(i, id);
    this.editCount++;

    chunk.updateColumn(lx, lz);
    if (id !== B.AIR && y > chunk.maxY) chunk.maxY = y;

    // Exposure, occlusion and sealing depend on the 3x3x3 neighbourhood.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.markDirty((x + dx) >> 4, (z + dz) >> 4);
      }
    }
    if (GROWS.has(old) || GROWS.has(id)) {
      if (!(LIGHT[old] || LIGHT[id])) chunk.rebuildEmitters();
    }
    if (this.onBlockChanged) this.onBlockChanged(x, y, z, old, id);
    // Light emitters affect a wider area.
    if (LIGHT[old] || LIGHT[id]) {
      chunk.rebuildEmitters();
      const r = MAX_LIGHT_RADIUS;
      for (let ccz = (z - r) >> 4; ccz <= (z + r) >> 4; ccz++) {
        for (let ccx = (x - r) >> 4; ccx <= (x + r) >> 4; ccx++) this.markDirty(ccx, ccz);
      }
    }
    return true;
  }

  markDirty(cx, cz) {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    chunk.dirty = true;
    chunk.version++;
    if (chunk.meshed) this.dirty.add(key);
  }

  /**
   * Light at a point for entities: sky (0..1, not scaled by daylight) and block light.
   */
  lightAt(x, y, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const chunk = this.chunks.get(chunkKey(bx >> 4, bz >> 4));
    if (!chunk) return { sky: 1, torch: 0 };
    const h = chunk.skyHeight[(bz & 15) * CHUNK + (bx & 15)];
    const sky = y >= h ? 1 : Math.max(0, 1 - 0.2 * (h - y));
    let torch = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.chunks.get(chunkKey((bx >> 4) + dx, (bz >> 4) + dz));
        if (!c || !c.emitters.length) continue;
        const e = c.emitters;
        for (let i = 0; i < e.length; i += 4) {
          const d = Math.hypot(c.cx * CHUNK + e[i] + 0.5 - x, e[i + 1] + 0.5 - y, c.cz * CHUNK + e[i + 2] + 0.5 - z);
          const v = 1 - d / e[i + 3];
          if (v > torch) torch = v;
        }
      }
    }
    return { sky, torch };
  }

  /** Highest solid block in a column (loaded chunks only), or -1. */
  topSolid(x, z) {
    const chunk = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!chunk) return -1;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      if (SOLID[chunk.blocks[blockIndex(x & 15, y, z & 15)]]) return y;
    }
    return -1;
  }
}
