// Sky dome, square sun and moon, stars, blocky clouds and the day/night lighting model.

import * as THREE from 'three';
import { SKY_GLSL, TONEMAP_GLSL } from './shaders.js';
import { mulberry32 } from '../world/noise.js';

const col = (hex) => new THREE.Color(hex);

// Palette keyframes (sRGB hex, converted to linear by THREE.Color).
const DAY = { zenith: col(0x3576de), horizon: col(0xa9d3f7), ground: col(0x7fa6cf) };
const DUSK = { zenith: col(0x39508f), horizon: col(0xf2a066), ground: col(0x5b4a5a) };
const NIGHT = { zenith: col(0x020409), horizon: col(0x0b1426), ground: col(0x05070d) };

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mix3(out, a, b, c, wb, wc) {
  // a -> b by wb, then -> c by wc
  tmpA.copy(a).lerp(b, wb);
  return out.copy(tmpA).lerp(c, wc);
}

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const skyFragment = /* glsl */ `
varying vec3 vDir;
${SKY_GLSL}
${TONEMAP_GLSL}
void main() {
  gl_FragColor = finalColor(skyColor(normalize(vDir)));
}
`;

const discVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv - 0.5;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pinned to the far plane: terrain always covers it
}
`;

const sunFragment = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  float d = max(abs(vUv.x), abs(vUv.y));
  float core = 1.0 - smoothstep(0.15, 0.158, d);
  float glow = exp(-(d - 0.15) * 9.0) * 0.35 * step(0.15, d);
  vec3 c = uColor * (core * 2.4 + glow);
  gl_FragColor = vec4(c * uOpacity, 1.0);
}
`;

const moonFragment = /* glsl */ `
varying vec2 vUv;
uniform float uOpacity;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = max(abs(vUv.x), abs(vUv.y));
  float core = 1.0 - smoothstep(0.12, 0.125, d);
  vec2 px = floor((vUv + 0.12) / 0.24 * 8.0);
  float crater = step(0.72, h(px)) * 0.25;
  float glow = exp(-(d - 0.12) * 12.0) * 0.18 * step(0.12, d);
  vec3 c = vec3(0.86, 0.88, 0.95) * (core * (1.2 - crater)) + vec3(0.5, 0.6, 0.9) * glow;
  gl_FragColor = vec4(c * uOpacity, 1.0);
}
`;

const starVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
varying float vTw;
void main() {
  vTw = 0.6 + 0.4 * sin(uTime * 2.0 + aPhase);
  gl_PointSize = aSize;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const starFragment = /* glsl */ `
uniform float uOpacity;
varying float vTw;
void main() {
  gl_FragColor = vec4(vec3(1.0) * uOpacity * vTw, 1.0);
}
`;

const cloudVertex = /* glsl */ `
attribute float aShade;
varying float vShade;
varying vec3 vView;
void main() {
  vShade = aShade;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vView = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const cloudFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uFade;
uniform float uAlpha;
varying float vShade;
varying vec3 vView;
${TONEMAP_GLSL}
void main() {
  float d = length(vView.xz);
  float a = (1.0 - smoothstep(uFade * 0.55, uFade, d)) * uAlpha;
  if (a <= 0.0) discard;
  vec4 c = finalColor(uColor * vShade);
  gl_FragColor = vec4(c.rgb, a);
}
`;

const CLOUD_CELLS = 64;
const CLOUD_SIZE = 12;
const CLOUD_Y = 118;
const CLOUD_T = 4;

function buildCloudGeometry() {
  // Periodic value noise so the tile repeats seamlessly.
  const rand = mulberry32(1337);
  const G = 16;
  const grid = new Float32Array(G * G).map(() => rand());
  const sample = (x, z, period) => {
    const fx = (x / CLOUD_CELLS) * period;
    const fz = (z / CLOUD_CELLS) * period;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const g = (i, k) => grid[((((iz + k) % period) + period) % period) * G + ((((ix + i) % period) + period) % period)];
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    return (g(0, 0) * (1 - sx) + g(1, 0) * sx) * (1 - sz) + (g(0, 1) * (1 - sx) + g(1, 1) * sx) * sz;
  };
  const occ = new Uint8Array(CLOUD_CELLS * CLOUD_CELLS);
  for (let z = 0; z < CLOUD_CELLS; z++) {
    for (let x = 0; x < CLOUD_CELLS; x++) {
      const v = sample(x, z, 8) * 0.65 + sample(x + 17, z + 5, 16) * 0.35;
      occ[z * CLOUD_CELLS + x] = v > 0.6 ? 1 : 0;
    }
  }
  const at = (x, z) => occ[(((z % CLOUD_CELLS) + CLOUD_CELLS) % CLOUD_CELLS) * CLOUD_CELLS + (((x % CLOUD_CELLS) + CLOUD_CELLS) % CLOUD_CELLS)];
  const pos = [];
  const shade = [];
  const quad = (a, b, c, d, s) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) shade.push(s);
  };
  const S = CLOUD_SIZE;
  for (let z = 0; z < CLOUD_CELLS; z++) {
    for (let x = 0; x < CLOUD_CELLS; x++) {
      if (!at(x, z)) continue;
      const x0 = x * S, x1 = x0 + S, z0 = z * S, z1 = z0 + S, y0 = 0, y1 = CLOUD_T;
      quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], 1.0);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0.72);
      if (!at(x + 1, z)) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], 0.86);
      if (!at(x - 1, z)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.86);
      if (!at(x, z + 1)) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.8);
      if (!at(x, z - 1)) quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], 0.8);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  g.computeBoundingSphere();
  return g;
}

export class Sky {
  constructor(scene, worldUniforms) {
    this.u = worldUniforms;
    this.group = new THREE.Group();
    scene.add(this.group);

    const skyMat = new THREE.ShaderMaterial({
      uniforms: worldUniforms,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // Stars
    const rand = mulberry32(99);
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(t) * 9;
      pos[i * 3 + 1] = u * 9;
      pos[i * 3 + 2] = r * Math.sin(t) * 9;
      size[i] = 1 + rand() * rand() * 2.5;
      phase[i] = rand() * 20;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: worldUniforms.uTime },
      vertexShader: starVertex,
      fragmentShader: starFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // Sun & moon: camera-relative squares.
    this.sunMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 0.97, 0.85) }, uOpacity: { value: 1 } },
      vertexShader: discVertex,
      fragmentShader: sunFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.sunMat);
    this.sun.renderOrder = -8;
    this.sun.frustumCulled = false;
    this.group.add(this.sun);

    this.moonMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: discVertex,
      fragmentShader: moonFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.moonMat);
    this.moon.renderOrder = -8;
    this.moon.frustumCulled = false;
    this.group.add(this.moon);

    // Clouds: 2x2 copies of a periodic tile that follow the camera.
    const cg = buildCloudGeometry();
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 380 }, uAlpha: { value: 0.88 } },
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
    });
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(cg, this.cloudMat);
      m.frustumCulled = false;
      m.renderOrder = 5;
      scene.add(m);
      this.clouds.push(m);
    }
    this.cloudDrift = 0;

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.daylight = 1;
    this.lightStrength = 1;
  }

  /**
   * Updates colours/lights for a time of day in [0, 1): 0 = sunrise, 0.25 = noon,
   * 0.5 = sunset, 0.75 = midnight.
   */
  update(dayTime, camera, dt) {
    const u = this.u;
    const theta = dayTime * Math.PI * 2;
    const sunDir = this.sunDir.set(Math.cos(theta), Math.sin(theta), 0.38).normalize();
    const e = sunDir.y;

    const day = smooth(-0.12, 0.28, e);
    const dusk = 1 - smooth(0.0, 0.32, Math.abs(e + 0.02));
    this.daylight = day;

    mix3(u.uZenith.value, NIGHT.zenith, DAY.zenith, DUSK.zenith, day, dusk * 0.55);
    mix3(u.uHorizon.value, NIGHT.horizon, DAY.horizon, DUSK.horizon, day, dusk * 0.8);
    mix3(u.uGround.value, NIGHT.ground, DAY.ground, DUSK.ground, day, dusk * 0.5);
    u.uGlowColor.value.setRGB(1.0, 0.55, 0.25).multiplyScalar(0.25 + dusk * 0.9).multiplyScalar(smooth(-0.25, 0.05, e));
    u.uGlowDir.value.copy(sunDir);

    // Direct light: the sun by day, a dim moon by night.
    const sunUp = smooth(-0.04, 0.12, e);
    const moonUp = smooth(-0.04, 0.12, -e);
    if (e > -0.02) {
      this.lightDir.copy(sunDir);
      tmpB.setRGB(1.0, 0.93, 0.82).lerp(tmpA.setRGB(1.0, 0.6, 0.35), dusk * 0.8);
      u.uSunColor.value.copy(tmpB).multiplyScalar(2.3 * sunUp);
      this.lightStrength = sunUp;
    } else {
      this.lightDir.copy(sunDir).negate();
      u.uSunColor.value.setRGB(0.45, 0.55, 0.9).multiplyScalar(0.5 * moonUp);
      this.lightStrength = moonUp * 0.4;
    }
    u.uSunDir.value.copy(this.lightDir);

    u.uSkyAmb.value.setRGB(0.2, 0.26, 0.45).lerp(tmpA.setRGB(0.62, 0.74, 1.0), day).multiplyScalar(0.42 + 0.38 * day);
    u.uGroundAmb.value.setRGB(0.08, 0.08, 0.12).lerp(tmpA.setRGB(0.5, 0.42, 0.32), day).multiplyScalar(0.25 + 0.3 * day);

    // Sky objects follow the camera.
    this.group.position.copy(camera.position);
    const place = (mesh, dir, dist, size) => {
      mesh.position.copy(dir).multiplyScalar(dist);
      mesh.scale.setScalar(size);
      mesh.lookAt(camera.position);
    };
    place(this.sun, sunDir, 8, 1.9);
    place(this.moon, this.moonDir.copy(sunDir).negate(), 8, 1.9);
    this.sunMat.uniforms.uOpacity.value = smooth(-0.2, 0.02, e);
    this.moonMat.uniforms.uOpacity.value = smooth(-0.2, 0.02, -e);
    this.starMat.uniforms.uOpacity.value = (1 - smooth(-0.3, 0.05, e)) * 0.9;
    this.stars.rotation.set(theta * 0.5, 0.3, 0);

    // Clouds drift slowly along +x.
    this.cloudDrift += dt * 1.2;
    const tile = 64 * 12;
    const ox = camera.position.x - this.cloudDrift;
    const oz = camera.position.z;
    const bx = Math.floor((ox - tile / 2) / tile) * tile + this.cloudDrift;
    const bz = Math.floor((oz - tile / 2) / tile) * tile;
    for (let i = 0; i < 4; i++) {
      this.clouds[i].position.set(bx + (i & 1) * tile, CLOUD_Y, bz + (i >> 1) * tile);
    }
    this.cloudMat.uniforms.uColor.value.setRGB(1, 1, 1).lerp(tmpA.setRGB(1.0, 0.72, 0.55), dusk * 0.35)
      .lerp(tmpA.setRGB(0.1, 0.12, 0.2), 1 - day);
    this.cloudMat.uniforms.uAlpha.value = 0.3 + 0.58 * day;
  }

  setCloudFade(dist) {
    this.cloudMat.uniforms.uFade.value = dist;
  }
}
