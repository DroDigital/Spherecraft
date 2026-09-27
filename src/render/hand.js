// First-person blocky arm (rendered in its own pass so it never clips into terrain).

import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';

function pixelTexture(w, h, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shade(hex, f) {
  const r = Math.min(255, ((hex >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * f) | 0;
  const b = Math.min(255, (hex & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
}

const SKIN = 0xc68a63;
const SLEEVE = 0x27a6a4;

function paintArm(ctx, w, h, sleeveRows, rand) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sleeve = y >= h - sleeveRows;
      const base = sleeve ? SLEEVE : SKIN;
      const f = 0.9 + rand() * 0.18 - (sleeve && y === h - sleeveRows ? 0.12 : 0);
      ctx.fillStyle = shade(base, f);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export class Hand {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.light = new THREE.DirectionalLight(0xffffff, 1.4);
    this.light.position.set(-0.4, 1, 0.6);
    this.scene.add(this.ambient, this.light);

    const rand = mulberry32(7);
    const side = pixelTexture(8, 24, (ctx, w, h) => paintArm(ctx, w, h, 9, rand));
    const skin = pixelTexture(8, 8, (ctx, w, h) => paintArm(ctx, w, h, 0, rand));
    const sleeve = pixelTexture(8, 8, (ctx, w, h) => paintArm(ctx, w, h, 8, rand));
    const sideMat = new THREE.MeshLambertMaterial({ map: side });
    const mats = [
      sideMat, sideMat,
      new THREE.MeshLambertMaterial({ map: skin }),
      new THREE.MeshLambertMaterial({ map: sleeve }),
      sideMat, sideMat,
    ];
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.95, 0.28), mats);
    this.arm.position.y = 0.475;


    this.pivot = new THREE.Group();
    this.pivot.add(this.arm);
    this.scene.add(this.pivot);

    this.base = { x: 0.62, y: -0.78, z: -0.62, rx: -1.12, ry: 0.0, rz: 0.42 };
    this.swingT = 1;
    this.bobPhase = 0;
    this.bobAmount = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  swing() {
    this.swingT = 0;
  }

  update(dt, { walking, brightness, sunColor }) {
    this.swingT = Math.min(1, this.swingT + dt * 4.5);
    const target = walking ? 1 : 0;
    this.bobAmount += (target - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += dt * 9 * (walking ? 1 : 0.3);

    const s = Math.sin(this.swingT * Math.PI);
    const b = this.base;
    const bob = this.bobAmount;
    this.pivot.position.set(
      b.x + Math.cos(this.bobPhase) * 0.035 * bob - s * 0.12,
      b.y - Math.abs(Math.sin(this.bobPhase)) * 0.04 * bob + s * 0.05,
      b.z - s * 0.15,
    );
    this.pivot.rotation.set(b.rx - s * 0.55, b.ry + s * 0.25, b.rz + s * 0.2);

    this.ambient.intensity = 0.2 + brightness * 0.7;
    this.light.color.copy(sunColor);
    this.light.intensity = 0.2 + brightness * 0.8;
  }
}
