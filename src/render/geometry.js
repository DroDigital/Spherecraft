import * as THREE from 'three';

const T = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
  [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
  [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
];
const ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/**
 * Indexed icosphere whose faces all lie *outside* the unit sphere, so a fragment
 * shader can ray-trace the exact sphere inside it without clipping the silhouette.
 */
export function circumscribedIcosphere(detail) {
  const verts = ICO_VERTS.map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = ICO_FACES.map((f) => f.slice());
  for (let s = 0; s < detail; s++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      let m = cache.get(key);
      if (m === undefined) {
        const va = verts[a];
        const vb = verts[b];
        const x = va[0] + vb[0];
        const y = va[1] + vb[1];
        const z = va[2] + vb[2];
        const l = Math.hypot(x, y, z);
        m = verts.length;
        verts.push([x / l, y / l, z / l]);
        cache.set(key, m);
      }
      return m;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  // Smallest distance from the origin to any face plane = inradius.
  let inradius = 1;
  for (const [a, b, c] of faces) {
    const va = verts[a];
    const vb = verts[b];
    const vc = verts[c];
    const e1 = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    const e2 = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(n[0], n[1], n[2]);
    const d = (n[0] * va[0] + n[1] * va[1] + n[2] * va[2]) / nl;
    inradius = Math.min(inradius, d);
  }
  const k = 1.002 / inradius;
  const position = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => {
    position[i * 3] = v[0] * k;
    position[i * 3 + 1] = v[1] * k;
    position[i * 3 + 2] = v[2] * k;
  });
  const index = new Uint16Array(faces.length * 3);
  faces.forEach((f, i) => index.set(f, i * 3));
  return {
    position: new THREE.BufferAttribute(position, 3),
    index: new THREE.BufferAttribute(index, 1),
    scale: k,
    triangles: faces.length,
  };
}
