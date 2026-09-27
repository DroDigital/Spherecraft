// Little spheres that burst out of broken blocks.

import * as THREE from 'three';

const MAX = 600;
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class Particles {
  constructor(scene) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.p = [];
  }

  burst(x, y, z, colorA, colorB, count = 16) {
    for (let i = 0; i < count; i++) {
      if (this.p.length >= MAX) this.p.shift();
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = 1.5 + Math.random() * 2.5;
      this.p.push({
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + (Math.random() - 0.5) * 0.6,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * sp * (1 - up * 0.5),
        vy: 2 + up * 4,
        vz: Math.sin(a) * sp * (1 - up * 0.5),
        life: 0,
        max: 0.6 + Math.random() * 0.6,
        size: 0.07 + Math.random() * 0.08,
        color: Math.random() < 0.7 ? colorA : colorB,
      });
    }
  }

  update(dt, world) {
    const list = this.p;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      q.vy -= 20 * dt;
      const nx = q.x + q.vx * dt;
      const ny = q.y + q.vy * dt;
      const nz = q.z + q.vz * dt;
      if (world.isSolid(Math.floor(nx), Math.floor(ny - q.size), Math.floor(nz))) {
        if (q.vy < 0) {
          q.vy *= -0.35;
          q.vx *= 0.6;
          q.vz *= 0.6;
        }
      } else {
        q.y = ny;
      }
      if (!world.isSolid(Math.floor(nx), Math.floor(q.y), Math.floor(q.z))) q.x = nx;
      else q.vx *= -0.3;
      if (!world.isSolid(Math.floor(q.x), Math.floor(q.y), Math.floor(nz))) q.z = nz;
      else q.vz *= -0.3;
      list[n++] = q;
    }
    list.length = n;

    const k = Math.min(n, MAX);
    for (let i = 0; i < k; i++) {
      const q = list[i];
      const s = q.size * Math.min(1, (q.max - q.life) * 4);
      _m.makeScale(s, s, s).setPosition(q.x, q.y, q.z);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setHex(q.color));
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
