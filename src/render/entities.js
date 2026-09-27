// Dynamic ray-traced ellipsoids for everything that moves: mobs, dropped items,
// arrows and the first-person hand. Instances are rebuilt every frame.

import * as THREE from 'three';
import { circumscribedIcosphere } from './geometry.js';
import { entityVertex, entityFragment, entityDepthFragment } from './shaders.js';

const STRIDE = 3 + 3 + 4 + 3 + 4 + 4;

export class EntitySpheres {
  /**
   * @param {THREE.Scene} scene
   * @param {object} uniforms shared world uniforms (or a hand-specific copy)
   * @param {object} opts { max, shadows, defines }
   */
  constructor(scene, uniforms, opts = {}) {
    this.max = opts.max ?? 4096;
    this.count = 0;
    this.data = new Float32Array(this.max * STRIDE);
    const buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    this.buffer = buf;
    const lod = circumscribedIcosphere(opts.detail ?? 1);
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(lod.index);
    g.setAttribute('position', lod.position);
    let o = 0;
    for (const [name, size] of [['iCenter', 3], ['iScale', 3], ['iQuat', 4], ['iColor', 3], ['iMat', 4], ['iLight', 4]]) {
      g.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, size, o));
      o += size;
    }
    g.instanceCount = 0;
    this.geometry = g;
    const defines = { ...(opts.defines || {}) };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      defines,
      vertexShader: entityVertex,
      fragmentShader: entityFragment,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    if (opts.shadows) {
      this.shadowMesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms,
        defines: { ...defines, DEPTH: '' },
        vertexShader: entityVertex,
        fragmentShader: entityDepthFragment,
      }));
      this.shadowMesh.frustumCulled = false;
      this.shadowMesh.layers.set(1);
      scene.add(this.shadowMesh);
    }
  }

  begin() {
    this.count = 0;
  }

  /**
   * Adds an ellipsoid. q is a THREE.Quaternion (or null for none).
   * mat: { type (palette id or -1), color (hex or THREE.Color), pattern, gloss, emissive }
   */
  push(x, y, z, sx, sy, sz, q, color, type, pattern, gloss, emissive, sky, torch, flash = 0, seed = 0.5) {
    if (this.count >= this.max) return;
    const d = this.data;
    let o = this.count * STRIDE;
    d[o++] = x; d[o++] = y; d[o++] = z;
    d[o++] = sx; d[o++] = sy; d[o++] = sz;
    if (q) { d[o++] = q.x; d[o++] = q.y; d[o++] = q.z; d[o++] = q.w; } else { d[o++] = 0; d[o++] = 0; d[o++] = 0; d[o++] = 1; }
    d[o++] = color.r; d[o++] = color.g; d[o++] = color.b;
    d[o++] = type; d[o++] = pattern; d[o++] = gloss; d[o++] = emissive;
    d[o++] = sky; d[o++] = torch; d[o++] = flash; d[o++] = seed;
    this.count++;
  }

  end() {
    this.geometry.instanceCount = this.count;
    this.buffer.clearUpdateRanges();
    this.buffer.addUpdateRange(0, this.count * STRIDE);
    this.buffer.needsUpdate = true;
    this.mesh.visible = this.count > 0;
    if (this.shadowMesh) this.shadowMesh.visible = this.count > 0;
  }
}

// Colour cache so callers can pass hex numbers.
const colorCache = new Map();
export function linearColor(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}
