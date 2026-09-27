// Axis-separated AABB movement against block cubes, shared by mobs and dropped items.

import { SOLID } from '../blocks.js';

const EPS = 1e-4;

function moveAxis(world, b, axis, delta) {
  if (delta === 0) return false;
  const p = b.pos;
  const hw = b.hw;
  const h = b.h;
  p[axis] += delta;
  const x0 = Math.floor(p.x - hw), x1 = Math.floor(p.x + hw - EPS);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + h - EPS);
  const z0 = Math.floor(p.z - hw), z1 = Math.floor(p.z + hw - EPS);
  let hit = false;
  let limit = delta > 0 ? Infinity : -Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!SOLID[world.getBlock(x, y, z)]) continue;
        hit = true;
        if (axis === 'x') limit = delta > 0 ? Math.min(limit, x - hw - EPS) : Math.max(limit, x + 1 + hw + EPS);
        else if (axis === 'y') limit = delta > 0 ? Math.min(limit, y - h - EPS) : Math.max(limit, y + 1);
        else limit = delta > 0 ? Math.min(limit, z - hw - EPS) : Math.max(limit, z + 1 + hw + EPS);
      }
    }
  }
  if (hit) p[axis] = limit;
  return hit;
}

/** Integrates velocity with collisions. Sets b.onGround and returns true if blocked sideways. */
export function moveBody(world, b, dt) {
  const v = b.vel;
  const steps = Math.max(1, Math.ceil((Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt) / 0.4));
  const h = dt / steps;
  let blocked = false;
  b.onGround = false;
  for (let s = 0; s < steps; s++) {
    if (moveAxis(world, b, 'y', v.y * h)) {
      if (v.y < 0) b.onGround = true;
      v.y = 0;
    }
    if (moveAxis(world, b, 'x', v.x * h)) { v.x = 0; blocked = true; }
    if (moveAxis(world, b, 'z', v.z * h)) { v.z = 0; blocked = true; }
  }
  return blocked;
}

/** Ray vs axis-aligned box; returns entry distance or -1. */
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let t0 = 0;
  let t1 = Infinity;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const lo = [minX, minY, minZ];
  const hi = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
      continue;
    }
    let a = (lo[i] - o[i]) / d[i];
    let c = (hi[i] - o[i]) / d[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return -1;
  }
  return t0;
}
