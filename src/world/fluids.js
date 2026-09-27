// Cellular water simulation. Sources (level 8) feed flowing water that loses one
// level per block sideways, falls straight down when it can, and dries up when its
// supply is cut. Two sources side by side over solid ground make a new source.

import { B, FLUID, SOLID, REPLACEABLE, NEEDS_SUPPORT } from '../blocks.js';
import { HEIGHT } from '../config.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const flowId = (level) => B.WATER_1 + level - 1;

function key(x, y, z) {
  return ((x + 1048576) * 2097152 + (z + 1048576)) * 128 + y;
}

function unkey(k) {
  const y = k % 128;
  const r = (k - y) / 128;
  const z = (r % 2097152) - 1048576;
  const x = Math.floor(r / 2097152) - 1048576;
  return [x, y, z];
}

export class Fluids {
  constructor(world) {
    this.world = world;
    this.queue = new Set();
    this.timer = 0;
    this.interval = 0.2; // seconds per simulation step
    this.maxPerStep = 700;
    this.onChange = null; // (x, y, z, id) => void, e.g. for splash effects
  }

  schedule(x, y, z) {
    if (y < 0 || y >= HEIGHT) return;
    this.queue.add(key(x, y, z));
  }

  /** Call whenever a block changes so nearby water reacts. */
  scheduleAround(x, y, z) {
    this.schedule(x, y, z);
    this.schedule(x, y + 1, z);
    this.schedule(x, y - 1, z);
    for (const [dx, dz] of DIRS) this.schedule(x + dx, y, z + dz);
  }

  update(dt) {
    this.timer += dt;
    if (this.timer < this.interval) return;
    this.timer = 0;
    if (!this.queue.size) return;
    const batch = [];
    for (const k of this.queue) {
      batch.push(k);
      if (batch.length >= this.maxPerStep) break;
    }
    for (const k of batch) this.queue.delete(k);
    for (const k of batch) {
      const [x, y, z] = unkey(k);
      this.step(x, y, z);
    }
  }

  _get(x, y, z) {
    return this.world.getBlock(x, y, z);
  }

  _set(x, y, z, id) {
    // Only simulate inside loaded chunks.
    if (!this.world.getChunk(x >> 4, z >> 4)) return false;
    if (!this.world.setBlock(x, y, z, id)) return false;
    this.scheduleAround(x, y, z);
    if (this.onChange) this.onChange(x, y, z, id);
    return true;
  }

  /** What a non-source cell should contain given its neighbours (0 = nothing). */
  desired(x, y, z) {
    const above = this._get(x, y + 1, z);
    if (FLUID[above]) return B.WATER_FALL;
    let best = 0;
    let sources = 0;
    for (const [dx, dz] of DIRS) {
      const n = this._get(x + dx, y, z + dz);
      const f = FLUID[n];
      if (!f) continue;
      if (n === B.WATER) sources++;
      // Falling water only spreads sideways once it has landed.
      if (n === B.WATER_FALL) {
        const under = this._get(x + dx, y - 1, z + dz);
        if (!SOLID[under] && !FLUID[under]) continue;
      }
      best = Math.max(best, f - 1);
    }
    const below = this._get(x, y - 1, z);
    if (sources >= 2 && (SOLID[below] || below === B.WATER)) return B.WATER;
    return best >= 1 ? flowId(Math.min(7, best)) : 0;
  }

  step(x, y, z) {
    const id = this._get(x, y, z);
    if (!FLUID[id]) {
      if (!REPLACEABLE[id] && !NEEDS_SUPPORT.has(id)) return;
      if (id === B.TORCH) return;
      const want = this.desired(x, y, z);
      if (want) this._set(x, y, z, want);
      return;
    }
    let level = FLUID[id];
    if (id !== B.WATER) {
      const want = this.desired(x, y, z);
      if (want !== id) {
        this._set(x, y, z, want || B.AIR);
        if (!want) return;
        level = FLUID[want];
      }
    }
    this.spread(x, y, z, level);
  }

  spread(x, y, z, level) {
    const below = this._get(x, y - 1, z);
    if (y > 0 && !FLUID[below] && (REPLACEABLE[below] || NEEDS_SUPPORT.has(below)) && below !== B.TORCH) {
      this._set(x, y - 1, z, B.WATER_FALL);
      return;
    }
    if (FLUID[below] && below !== B.WATER && below !== B.WATER_FALL) {
      // Flowing water underneath is topped up into a falling column.
      this._set(x, y - 1, z, B.WATER_FALL);
      return;
    }
    if (FLUID[below]) return;
    if (level <= 1) return;
    const next = level - 1;
    for (const [dx, dz] of DIRS) {
      const n = this._get(x + dx, y, z + dz);
      const f = FLUID[n];
      if (f) {
        if (n !== B.WATER && n !== B.WATER_FALL && f < next) this._set(x + dx, y, z + dz, flowId(next));
      } else if ((REPLACEABLE[n] || NEEDS_SUPPORT.has(n)) && n !== B.TORCH) {
        this._set(x + dx, y, z + dz, flowId(next));
      }
    }
  }
}
