// Owns the WebGL renderer and composes the frame: shadows, sky, world, hand.

import * as THREE from 'three';
import { BLOCKS, B } from '../blocks.js';
import { ChunkRenderer, createWorldUniforms } from './chunkRenderer.js';
import { circumscribedIcosphere } from './geometry.js';
import { Sky } from './sky.js';
import { Hand } from './hand.js';
import { Particles } from './particles.js';
import { highlightVertex, highlightFragment } from './shaders.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Graphics {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // keeps the sky and water saturated
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false; // count the whole frame, not just the last pass
    this.pixelRatioCap = 2;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1000);
    this.camera.rotation.order = 'YXZ';

    this.uniforms = createWorldUniforms();
    this.chunks = new ChunkRenderer(this.scene, this.uniforms);
    this.sky = new Sky(this.scene, this.uniforms);
    this.particles = new Particles(this.scene);
    this.hand = new Hand();

    // Lights for the few built-in materials in the world scene (particles).
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.scene.add(this.ambient, this.sunLight, this.sunLight.target);

    this._initHighlight();
    this._initShadows();
    this.shadowsEnabled = false;
    this.resize();
  }

  _initHighlight() {
    const lod = circumscribedIcosphere(2);
    const g = new THREE.BufferGeometry();
    g.setIndex(lod.index);
    g.setAttribute('position', lod.position);
    this.highlightMat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uScale: { value: new THREE.Vector3(0.53, 0.53, 0.53) },
        uPulse: { value: 0 },
      },
      vertexShader: highlightVertex,
      fragmentShader: highlightFragment,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.highlight = new THREE.Mesh(g, this.highlightMat);
    this.highlight.frustumCulled = false;
    this.highlight.renderOrder = 10;
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  _initShadows() {
    this.shadowRange = 44;
    const R = this.shadowRange;
    this.lightCam = new THREE.OrthographicCamera(-R, R, R, -R, 1, 321);
    this.lightCam.layers.set(1);
    this.uniforms.uDepthScale.value = 1 / (this.lightCam.far - this.lightCam.near);
    this.shadowRT = null;
    this._shadowTarget(1);
  }

  /**
   * (Re)creates the shadow map. The texture is always cleared once so the samplers
   * see a valid depth texture even when shadows are switched off.
   */
  _shadowTarget(size) {
    if (this.shadowRT && this.shadowSize === size) return;
    if (this.shadowRT) {
      this.shadowRT.depthTexture.dispose();
      this.shadowRT.dispose();
    }
    this.shadowSize = size;
    const depth = new THREE.DepthTexture(size, size);
    depth.type = THREE.UnsignedIntType;
    // Hardware depth comparison + bilinear filtering = smooth PCF edges.
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    this.shadowRT = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, depthTexture: depth });
    this.uniforms.uShadowMap.value = depth;
    this.uniforms.uShadowTexel.value = 1 / size;
    const r = this.renderer;
    r.setRenderTarget(this.shadowRT);
    r.clear();
    r.setRenderTarget(null);
  }

  setShadows(on, size = 2048) {
    this.shadowsEnabled = on;
    this.uniforms.uShadowOn.value = on ? 1 : 0;
    this._shadowTarget(on ? size : 1);
  }

  setPixelRatioCap(cap) {
    this.pixelRatioCap = cap;
    this.resize();
  }

  /** Extra multiplier applied on top of the resolution setting (used by auto-scaling). */
  setResolutionScale(scale) {
    this.resolutionScale = scale;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap) * (this.resolutionScale ?? 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.hand.resize(w / h);
  }

  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setRenderDistance(chunks) {
    const far = chunks * 16;
    this.uniforms.uFogNear.value = far * 0.55;
    this.uniforms.uFogFar.value = far - 6;
    this.sky.setCloudFade(Math.max(260, far * 2.2));
  }

  /** Shows the selection shell around a targeted block (or hides it for null). */
  setTarget(hit) {
    if (!hit) {
      this.highlight.visible = false;
      return;
    }
    const u = this.highlightMat.uniforms;
    const id = hit.id;
    let cx = hit.x + 0.5, cy = hit.y + 0.5, cz = hit.z + 0.5;
    if (id === B.TORCH) {
      cy -= 0.08;
      u.uScale.value.set(0.16, 0.42, 0.16);
    } else if (id === B.CACTUS) {
      u.uScale.value.set(0.47, 0.54, 0.47);
    } else if (BLOCKS[id].parts) {
      cy -= 0.2;
      u.uScale.value.set(0.34, 0.32, 0.34);
    } else {
      const r = BLOCKS[id].radius + 0.03;
      u.uScale.value.set(r, r, r);
    }
    u.uCenter.value.set(cx, cy, cz);
    this.highlight.visible = true;
  }

  _renderShadows(focus) {
    const lc = this.lightCam;
    const dir = this.sky.lightDir;
    const dist = 160;
    lc.position.copy(focus).addScaledVector(dir, dist);
    if (Math.abs(dir.y) > 0.98) lc.up.set(0, 0, 1);
    else lc.up.set(0, 1, 0);
    lc.lookAt(focus);
    // Snap to shadow-map texels so the shadows don't shimmer as the player moves.
    const texel = (2 * this.shadowRange) / this.shadowSize;
    _q.copy(lc.quaternion).invert();
    _v.copy(lc.position).applyQuaternion(_q);
    _v.x = Math.round(_v.x / texel) * texel;
    _v.y = Math.round(_v.y / texel) * texel;
    lc.position.copy(_v.applyQuaternion(lc.quaternion));
    lc.updateMatrixWorld();

    const r = this.renderer;
    r.setRenderTarget(this.shadowRT);
    r.clear();
    r.render(this.scene, lc);
    r.setRenderTarget(null);

    const cam = this.camera.position;
    this.uniforms.uShadowMatrix.value
      .multiplyMatrices(lc.projectionMatrix, lc.matrixWorldInverse)
      .multiply(_m.makeTranslation(cam.x, cam.y, cam.z));
    this.uniforms.uLightRay.value.copy(dir).negate();
  }

  render(dt, { dayTime, time, focus, handState, showHand }) {
    const u = this.uniforms;
    u.uTime.value = time;
    this.camera.updateMatrixWorld();
    this.sky.update(dayTime, this.camera, dt);

    this.sunLight.position.copy(this.sky.lightDir).multiplyScalar(50).add(this.camera.position);
    this.sunLight.target.position.copy(this.camera.position);
    this.sunLight.color.copy(u.uSunColor.value).multiplyScalar(0.8);
    this.ambient.color.copy(u.uSkyAmb.value).multiplyScalar(1.6);

    this.renderer.info.reset();
    const shadowsOn = this.shadowsEnabled && this.sky.lightStrength > 0.02;
    u.uShadowOn.value = shadowsOn ? 1 : 0;
    if (shadowsOn) this._renderShadows(focus);

    this.highlightMat.uniforms.uPulse.value = 0.5 + 0.5 * Math.sin(time * 5);

    const r = this.renderer;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scene, this.camera);
    if (showHand) {
      this.hand.update(dt, { ...handState, sunColor: u.uSunColor.value });
      r.clearDepth();
      r.render(this.hand.scene, this.hand.camera);
    }
  }
}
