// Loads, meshes and unloads chunks around the player within a per-frame time budget.

import { chunkKey, keyToChunk } from '../config.js';
import { meshChunk } from '../world/mesher.js';

export class Streamer {
  constructor(world, chunkRenderer) {
    this.world = world;
    this.renderer = chunkRenderer;
    this.radius = 8;
    this.center = null;
    this.order = [];
    this.budgetMs = 7;
  }

  setRadius(r) {
    if (r === this.radius) return;
    this.radius = r;
    this.center = null; // force a rebuild of the load order
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

    // Drop meshes (and later, block data) that fell out of range.
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

  /** Streams chunks; returns the number of chunks in range that still need work. */
  update(pcx, pcz, budgetMs = this.budgetMs) {
    if (!this.center || this.center.cx !== pcx || this.center.cz !== pcz) this._rebuild(pcx, pcz);
    const world = this.world;

    // Player edits are rebuilt immediately so digging feels instant.
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
      if (performance.now() > deadline) {
        pending++;
        continue;
      }
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

  reset() {
    this.renderer.clear();
    this.center = null;
    this.order = [];
  }
}
