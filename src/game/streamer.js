// Loads, meshes and unloads chunks around the player. Generation and meshing run
// on a pool of web workers when available; player edits are re-meshed immediately
// on the main thread so digging never lags.

import { chunkKey, keyToChunk } from '../config.js';
import { meshChunk } from '../world/mesher.js';
import { Chunk } from '../world/world.js';
import ChunkWorker from '../world/worker.js?worker&inline';

function createPool(seed) {
  if (typeof Worker === 'undefined') return null;
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const pool = [];
  try {
    for (let i = 0; i < n; i++) {
      const w = new ChunkWorker();
      w.postMessage({ type: 'seed', seed });
      pool.push({ worker: w, busy: 0 });
    }
  } catch {
    for (const p of pool) p.worker.terminate();
    return null;
  }
  return pool;
}

export class Streamer {
  constructor(world, chunkRenderer) {
    this.world = world;
    this.renderer = chunkRenderer;
    this.radius = 8;
    this.center = null;
    this.order = [];
    this.budgetMs = 7;
    this.pending = new Map(); // key -> 'gen' | 'mesh'
    this.maxInFlight = 3; // per worker
    this.pool = createPool(world.seed);
    if (this.pool) {
      for (const p of this.pool) p.worker.onmessage = (e) => this._onResult(p, e.data);
    }
  }

  dispose() {
    if (this.pool) for (const p of this.pool) p.worker.terminate();
    this.pool = null;
  }

  setRadius(r) {
    if (r === this.radius) return;
    this.radius = r;
    this.center = null;
  }

  _rebuild(cx, cz) {
    this.center = { cx, cz };
    const R = this.radius;
    const list = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) {
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d = Math.hypot(dx, dz);
        if (d <= R + 0.5) list.push({ cx: cx + dx, cz: cz + dz, d });
      }
    }
    list.sort((a, b) => a.d - b.d);
    this.order = list;
    for (const key of [...this.renderer.meshes.keys()]) {
      const [x, z] = keyToChunk(key);
      if (Math.hypot(x - cx, z - cz) > R + 1.5) {
        this.renderer.remove(key);
        const chunk = this.world.chunks.get(key);
        if (chunk) chunk.meshed = false;
      }
    }
    for (const [key, chunk] of [...this.world.chunks]) {
      if (Math.hypot(chunk.cx - cx, chunk.cz - cz) > R + 3) this.world.unloadChunk(key);
    }
    this.renderer.setCenter(cx, cz);
  }

  meshNow(chunk) {
    const data = meshChunk(this.world, chunk);
    this.renderer.setChunk(chunk, data);
    chunk.meshed = true;
    chunk.dirty = false;
  }

  _freeWorker() {
    let best = null;
    for (const p of this.pool) if (p.busy < this.maxInFlight && (!best || p.busy < best.busy)) best = p;
    return best;
  }

  _requestGen(cx, cz) {
    const key = chunkKey(cx, cz);
    if (this.pending.has(key)) return true;
    const p = this._freeWorker();
    if (!p) return false;
    const edits = this.world.edits.get(key);
    const flat = [];
    if (edits) for (const [i, id] of edits) flat.push(i, id);
    p.busy++;
    this.pending.set(key, 'gen');
    p.worker.postMessage({ type: 'gen', cx, cz, edits: flat.length ? flat : null });
    return true;
  }

  _requestMesh(chunk) {
    if (this.pending.has(chunk.key)) return true;
    const p = this._freeWorker();
    if (!p) return false;
    const chunks = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
        chunks.push({ cx: c.cx, cz: c.cz, blocks: c.blocks.slice(), skyHeight: c.skyHeight, maxY: c.maxY, emitters: c.emitters });
      }
    }
    p.busy++;
    this.pending.set(chunk.key, 'mesh');
    p.worker.postMessage({ type: 'mesh', cx: chunk.cx, cz: chunk.cz, version: chunk.version, chunks }, chunks.map((c) => c.blocks.buffer));
    return true;
  }

  _onResult(p, m) {
    p.busy--;
    const key = chunkKey(m.cx, m.cz);
    this.pending.delete(key);
    if (m.type === 'gen') {
      if (this.world.chunks.has(key)) return;
      // Ignore chunks that scrolled out of range while being generated.
      if (this.center && Math.hypot(m.cx - this.center.cx, m.cz - this.center.cz) > this.radius + 3) return;
      this.world.addChunk(Chunk.fromData(m));
    } else {
      const chunk = this.world.chunks.get(key);
      if (!chunk || chunk.version !== m.version) return; // edited meanwhile: will be re-meshed
      if (!this.center || Math.hypot(m.cx - this.center.cx, m.cz - this.center.cz) > this.radius + 1.5) return;
      this.renderer.setChunk(chunk, m.data);
      chunk.meshed = true;
      chunk.dirty = false;
    }
  }

  /** Streams chunks; returns the number of chunks in range that still need work. */
  update(pcx, pcz, budgetMs = this.budgetMs) {
    if (!this.center || this.center.cx !== pcx || this.center.cz !== pcz) this._rebuild(pcx, pcz);
    const world = this.world;

    if (world.dirty.size) {
      for (const key of world.dirty) {
        const chunk = world.chunks.get(key);
        if (chunk && world.neighborsLoaded(chunk.cx, chunk.cz)) this.meshNow(chunk);
      }
      world.dirty.clear();
    }

    const deadline = performance.now() + budgetMs;
    let pending = 0;
    for (const e of this.order) {
      const chunk = world.chunks.get(chunkKey(e.cx, e.cz));
      if (chunk && chunk.meshed && !chunk.dirty) continue;
      pending++;
      if (this.pool) {
        let ready = true;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!world.hasChunk(e.cx + dx, e.cz + dz)) {
              ready = false;
              this._requestGen(e.cx + dx, e.cz + dz);
            }
          }
        }
        if (ready) this._requestMesh(chunk);
        if (!this._freeWorker()) break;
        continue;
      }
      if (performance.now() > deadline) continue;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!world.hasChunk(e.cx + dx, e.cz + dz)) world.loadChunk(e.cx + dx, e.cz + dz);
        }
      }
      this.meshNow(world.getChunk(e.cx, e.cz));
    }
    return pending;
  }

  /** Fraction of chunks within `radius` that are meshed (for the loading screen). */
  progress(radius) {
    let total = 0;
    let done = 0;
    for (const e of this.order) {
      if (e.d > radius) break;
      total++;
      const chunk = this.world.chunks.get(chunkKey(e.cx, e.cz));
      if (chunk && chunk.meshed) done++;
    }
    return total ? done / total : 0;
  }

  /** Synchronously builds everything within `radius` (used when starting a new world). */
  buildNow(pcx, pcz, radius) {
    this._rebuild(pcx, pcz);
    for (const e of this.order) {
      if (e.d > radius) break;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!this.world.hasChunk(e.cx + dx, e.cz + dz)) this.world.loadChunk(e.cx + dx, e.cz + dz);
        }
      }
      const c = this.world.getChunk(e.cx, e.cz);
      if (!c.meshed || c.dirty) this.meshNow(c);
    }
  }

  reset() {
    this.renderer.clear();
    this.center = null;
    this.order = [];
    this.dispose();
  }
}
