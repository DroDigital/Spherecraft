import { describe, it, expect } from 'vitest';
import { circumscribedIcosphere } from '../src/render/geometry.js';
import { raycast } from '../src/game/raycast.js';

describe('circumscribed icosphere', () => {
  for (const detail of [0, 1, 2]) {
    it(`detail ${detail} encloses the unit sphere with outward-facing triangles`, () => {
      const { position, index } = circumscribedIcosphere(detail);
      const p = position.array;
      const idx = index.array;
      expect(idx.length / 3).toBe(20 * 4 ** detail);
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const len = Math.hypot(...n);
        const dist = (n[0] * a[0] + n[1] * a[1] + n[2] * a[2]) / len;
        expect(dist).toBeGreaterThanOrEqual(1); // plane outside the sphere, normal pointing out
      }
    });
  }
});

describe('raycast', () => {
  const solid = new Set(['2,0,-5', '0,3,0']);
  const getBlock = (x, y, z) => (solid.has(`${x},${y},${z}`) ? 1 : 0);
  const hit = (id) => id !== 0;

  it('finds the first block and the face it entered', () => {
    const r = raycast(getBlock, 2.5, 0.5, 0.5, 0, 0, -1, 10, hit);
    expect(r).toMatchObject({ x: 2, y: 0, z: -5, nx: 0, ny: 0, nz: 1 });
    expect(r.t).toBeCloseTo(4.5);
  });

  it('hits from below with a downward-facing normal', () => {
    const r = raycast(getBlock, 0.5, 0.5, 0.5, 0, 1, 0, 10, hit);
    expect(r).toMatchObject({ x: 0, y: 3, z: 0, nx: 0, ny: -1, nz: 0 });
  });

  it('returns null beyond the reach distance', () => {
    expect(raycast(getBlock, 2.5, 0.5, 0.5, 0, 0, -1, 3, hit)).toBeNull();
  });
});
