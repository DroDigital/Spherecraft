// First-person arm made of spheres, holding the selected item. Rendered in its own
// pass (so it never clips into terrain) with the same sphere shader as the world.

import * as THREE from 'three';
import { EntitySpheres, linearColor } from './entities.js';
import { itemModel } from './itemModels.js';
import { PATTERN } from '../blocks.js';

const SKIN = 0xd49a72;
const SLEEVE = 0x27a6a4;

const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Hand {
  constructor(worldUniforms) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    // Same lighting as the world, but in camera space and without fog or shadows.
    this.sunWorld = worldUniforms.uSunDir.value;
    this.uniforms = { ...worldUniforms, uSunDir: { value: new THREE.Vector3(0, 1, 0) } };
    this.spheres = new EntitySpheres(this.scene, this.uniforms, { max: 32, detail: 2, defines: { NO_SHADOW: '', NO_FOG: '' } });
    this.base = { x: 0.5, y: -0.55, z: -0.72, rx: -1.0, ry: 0.15, rz: 0.35 };
    this.swingT = 1;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.eatT = 0;
    this.held = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  swing() {
    this.swingT = 0;
  }

  setHeld(id) {
    this.held = id || 0;
  }

  _add(local, scale, color, type, pattern, gloss, emissive, light) {
    _v.copy(local).applyQuaternion(_pq).add(_p);
    this.spheres.push(_v.x, _v.y, _v.z, scale[0], scale[1], scale[2], _pq, linearColor(color), type, pattern, gloss, emissive, light.sky, light.torch, 0, 0.4);
  }

  update(dt, { walking, sky, torch, worldCamera, eating }) {
    this.swingT = Math.min(1, this.swingT + dt * 4.5);
    this.bobAmount += ((walking ? 1 : 0) - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += dt * 9 * (walking ? 1 : 0.3);
    this.eatT = eating ? this.eatT + dt : 0;

    // Sun direction into camera space.
    this.uniforms.uSunDir.value.copy(worldCameraSun(worldCamera, this.sunWorld));

    const s = Math.sin(this.swingT * Math.PI);
    const b = this.base;
    const bob = this.bobAmount;
    const eat = eating ? Math.sin(this.eatT * 18) * 0.03 : 0;
    _p.set(
      b.x + Math.cos(this.bobPhase) * 0.03 * bob - s * 0.12 - (eating ? 0.2 : 0),
      b.y - Math.abs(Math.sin(this.bobPhase)) * 0.035 * bob + s * 0.05 + eat + (eating ? 0.15 : 0),
      b.z - s * 0.15,
    );
    _e.set(b.rx - s * 0.6 + (eating ? 0.5 : 0), b.ry + s * 0.25, b.rz + s * 0.2);
    _pq.setFromEuler(_e);

    const light = { sky, torch };
    this.spheres.begin();
    // Sleeve, forearm and a round fist.
    this._add(_v.set(0, -0.05, 0), [0.17, 0.3, 0.17], SLEEVE, -1, PATTERN.WOOL, 0.15, 0, light);
    this._add(_v.set(0, 0.35, 0), [0.13, 0.3, 0.13], SKIN, -1, PATTERN.PLAIN, 0.3, 0, light);
    this._add(_v.set(0, 0.68, 0.01), [0.15, 0.14, 0.15], SKIN, -1, PATTERN.PLAIN, 0.3, 0, light);
    this._add(_v.set(-0.1, 0.62, -0.06), [0.05, 0.08, 0.05], SKIN, -1, PATTERN.PLAIN, 0.3, 0, light); // thumb

    if (this.held) {
      // Held item sits in the fist, tilted forward.
      const parts = itemModel(this.held);
      const isBlock = parts.length === 1 && parts[0].type >= 0;
      const k = isBlock ? 0.36 : 0.62;
      const saveP = _p.clone();
      const saveQ = _pq.clone();
      _v.set(0, 0.8, -0.1).applyQuaternion(saveQ).add(saveP);
      _p.copy(_v);
      _q.setFromEuler(_e.set(isBlock ? 0.3 : 0.9, 0.2, 0));
      _pq.copy(saveQ).multiply(_q);
      for (const pt of parts) {
        _v.set(pt.p[0] * k, pt.p[1] * k + (isBlock ? 0.1 : 0.2), pt.p[2] * k);
        this._add(_v, [pt.s[0] * k, pt.s[1] * k, pt.s[2] * k], pt.color, pt.type, pt.pattern, pt.gloss, pt.emissive, light);
      }
      _p.copy(saveP);
      _pq.copy(saveQ);
    }
    this.spheres.end();
  }
}

const _inv = new THREE.Quaternion();
const _sun = new THREE.Vector3();
function worldCameraSun(camera, sunWorld) {
  _inv.copy(camera.quaternion).invert();
  return _sun.copy(sunWorld).applyQuaternion(_inv);
}
