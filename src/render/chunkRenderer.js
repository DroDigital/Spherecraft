// Uploads mesher output to the GPU and manages per-chunk meshes, LOD and visibility.

import * as THREE from 'three';
import { BLOCKS, SHAPES, MAX_BLOCK_ID } from '../blocks.js';
import { CHUNK, WATER_DROP } from '../config.js';
import { circumscribedIcosphere } from './geometry.js';
import { sphereVertex, sphereFragment, depthFragment, sealVertex, sealFragment, sealDepthVertex, sealDepthFragment } from './shaders.js';

/** 64x3 float texture: [colorA, pattern], [colorB, gloss], [emissive, radius, -, -]. */
function createPaletteTexture() {
  const W = MAX_BLOCK_ID;
  const data = new Float32Array(W * 3 * 4);
  const c = new THREE.Color();
  for (const def of BLOCKS) {
    if (!def) continue;
    const i = def.id * 4;
    c.setHex(def.color);
    data[i] = c.r;
    data[i + 1] = c.g;
    data[i + 2] = c.b;
    data[i + 3] = def.pattern;
    c.setHex(def.color2 ?? def.color);
    const j = (W + def.id) * 4;
    data[j] = c.r;
    data[j + 1] = c.g;
    data[j + 2] = c.b;
    data[j + 3] = def.gloss;
    const k = (2 * W + def.id) * 4;
    data[k] = def.emissive;
    data[k + 1] = def.radius;
  }
  const tex = new THREE.DataTexture(data, W, 3, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function shapeUniforms() {
  const off = [];
  const scale = [];
  for (let i = 0; i < 16; i++) {
    const s = SHAPES[i];
    off.push(s ? new THREE.Vector4(s.offset[0], s.offset[1], s.offset[2], s.jitter) : new THREE.Vector4());
    scale.push(s ? new THREE.Vector4(s.scale[0], s.scale[1], s.scale[2], s.vary) : new THREE.Vector4(0.5, 0.5, 0.5, 0));
  }
  return { off, scale };
}

/** Uniforms shared by every world material (lighting, fog, shadows, palette...). */
export function createWorldUniforms() {
  const shapes = shapeUniforms();
  return {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSkyAmb: { value: new THREE.Color(0.5, 0.6, 0.8) },
    uGroundAmb: { value: new THREE.Color(0.3, 0.25, 0.2) },
    uTorchColor: { value: new THREE.Color(1.4, 0.95, 0.5) },
    uFogColor: { value: new THREE.Color(0.05, 0.2, 0.45) },
    uUnderwater: { value: 0 },
    uZenith: { value: new THREE.Color(0.2, 0.4, 0.9) },
    uHorizon: { value: new THREE.Color(0.6, 0.75, 0.95) },
    uGround: { value: new THREE.Color(0.35, 0.4, 0.5) },
    uGlowColor: { value: new THREE.Color(0.4, 0.35, 0.3) },
    uGlowDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
    uFogNear: { value: 60 },
    uFogFar: { value: 120 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 },
    uShadowTexel: { value: 1 / 2048 },
    uPalette: { value: createPaletteTexture() },
    uShapeOff: { value: shapes.off },
    uShapeScale: { value: shapes.scale },
    uBreakPos: { value: new THREE.Vector3(0, -1000, 0) },
    uBreak: { value: 0 },
    uLightRay: { value: new THREE.Vector3(0, -1, 0) },
    uDepthScale: { value: 1 / 300 },
  };
}

function instancedGeometry(lod, attrs, count, bounds) {
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(lod.index);
  g.setAttribute('position', lod.position);
  g.setAttribute('aPos', attrs.pos);
  g.setAttribute('aAoA', attrs.aoA);
  g.setAttribute('aAoB', attrs.aoB);
  g.instanceCount = count;
  g.boundingSphere = bounds;
  return g;
}

function instanceAttributes(inst) {
  return {
    pos: new THREE.InstancedBufferAttribute(inst.pos, 4),
    aoA: new THREE.InstancedBufferAttribute(inst.aoA, 4),
    aoB: new THREE.InstancedBufferAttribute(inst.aoB, 4),
  };
}

function quadGeometry(quads, bounds) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(quads.position, 3));
  g.setAttribute('aSeal', new THREE.BufferAttribute(quads.data, 4));
  g.boundingSphere = bounds;
  return g;
}

function disposeGeometry(g) {
  // The LOD sphere buffers are shared by every chunk; detach them so dispose() only
  // frees this chunk's own attributes.
  if (g.isInstancedBufferGeometry) {
    g.setIndex(null);
    g.deleteAttribute('position');
  }
  g.dispose();
}

export class ChunkRenderer {
  constructor(scene, uniforms) {
    this.scene = scene;
    this.uniforms = uniforms;
    this.lods = [circumscribedIcosphere(0), circumscribedIcosphere(1), circumscribedIcosphere(2)];
    this.meshes = new Map();
    this.deepRadius = 3;
    this.center = { cx: 0, cz: 0 };

    const u = uniforms;
    this.solidMat = new THREE.ShaderMaterial({
      name: 'spheres',
      uniforms: u,
      vertexShader: sphereVertex,
      fragmentShader: sphereFragment,
    });
    this.waterMat = new THREE.ShaderMaterial({
      name: 'water-spheres',
      uniforms: u,
      defines: { WATER: '', WATER_DROP: WATER_DROP.toFixed(3) },
      vertexShader: sphereVertex,
      fragmentShader: sphereFragment,
    });
    this.depthMat = new THREE.ShaderMaterial({
      name: 'sphere-depth',
      uniforms: u,
      defines: { DEPTH: '' },
      vertexShader: sphereVertex,
      fragmentShader: depthFragment,
    });
    this.sealMat = new THREE.ShaderMaterial({
      name: 'sealer',
      uniforms: u,
      defines: { SEAL_PUSH: '0.06' },
      side: THREE.DoubleSide,
      vertexShader: sealVertex,
      fragmentShader: sealFragment,
    });
    this.sealDepthMat = new THREE.ShaderMaterial({
      name: 'sealer-depth',
      side: THREE.DoubleSide,
      vertexShader: sealDepthVertex,
      fragmentShader: sealDepthFragment,
    });
    this.waterSealMat = new THREE.ShaderMaterial({
      name: 'water-sealer',
      uniforms: u,
      defines: { WATER: '', SEAL_PUSH: '0.03' },
      side: THREE.DoubleSide,
      vertexShader: sealVertex,
      fragmentShader: sealFragment,
    });
  }

  lodFor(cx, cz) {
    const d = Math.max(Math.abs(cx - this.center.cx), Math.abs(cz - this.center.cz));
    return d === 0 ? 2 : d <= 2 ? 1 : 0;
  }

  /** Replaces the meshes of a chunk with freshly meshed data. */
  setChunk(chunk, data) {
    this.remove(chunk.key);
    const { cx, cz } = chunk;
    const group = new THREE.Group();
    group.position.set(cx * CHUNK, 0, cz * CHUNK);
    const halfH = (data.maxY - data.minY + 1) / 2;
    const bounds = new THREE.Sphere(
      new THREE.Vector3(CHUNK / 2, data.minY + halfH, CHUNK / 2),
      Math.sqrt(CHUNK * CHUNK / 2 + halfH * halfH) + 1.5,
    );
    const lodIndex = this.lodFor(cx, cz);
    const lod = this.lods[lodIndex];
    const entry = { group, cx, cz, lod: lodIndex, inst: [], deep: [], count: 0 };

    const add = (mesh, list) => {
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      if (list) list.push(mesh);
      return mesh;
    };

    if (data.solid.count) {
      const attrs = instanceAttributes(data.solid);
      add(new THREE.Mesh(instancedGeometry(lod, attrs, data.solid.count, bounds), this.solidMat), entry.inst);
      const shadow = add(new THREE.Mesh(instancedGeometry(this.lods[0], attrs, data.solid.count, bounds), this.depthMat));
      shadow.layers.set(1);
      entry.count += data.solid.count;
    }
    if (data.deep.count) {
      const attrs = instanceAttributes(data.deep);
      const m = add(new THREE.Mesh(instancedGeometry(lod, attrs, data.deep.count, bounds), this.solidMat), entry.inst);
      entry.deep.push(m);
      entry.count += data.deep.count;
    }
    if (data.water.count) {
      const attrs = instanceAttributes(data.water);
      add(new THREE.Mesh(instancedGeometry(lod, attrs, data.water.count, bounds), this.waterMat), entry.inst);
      entry.count += data.water.count;
    }
    // Sealers are cheap and approximate the terrain surface, so they are drawn first
    // and act as a depth pre-pass for the (more expensive) sphere fragments.
    if (data.seal.count) {
      const g = quadGeometry(data.seal, bounds);
      add(new THREE.Mesh(g, this.sealMat)).renderOrder = -1;
      add(new THREE.Mesh(g, this.sealDepthMat)).layers.set(1);
    }
    if (data.deepSeal.count) {
      const m = add(new THREE.Mesh(quadGeometry(data.deepSeal, bounds), this.sealMat), entry.deep);
      m.renderOrder = -1;
    }
    if (data.waterSeal.count) add(new THREE.Mesh(quadGeometry(data.waterSeal, bounds), this.waterSealMat)).renderOrder = -1;

    const deepVisible = this.isDeepVisible(cx, cz);
    for (const m of entry.deep) m.visible = deepVisible;
    group.updateMatrixWorld(true);
    group.matrixAutoUpdate = false;
    this.scene.add(group);
    this.meshes.set(chunk.key, entry);
  }

  isDeepVisible(cx, cz) {
    return Math.max(Math.abs(cx - this.center.cx), Math.abs(cz - this.center.cz)) <= this.deepRadius;
  }

  remove(key) {
    const entry = this.meshes.get(key);
    if (!entry) return;
    this.scene.remove(entry.group);
    for (const m of entry.group.children) disposeGeometry(m.geometry);
    this.meshes.delete(key);
  }

  /** Re-centres LOD and cave visibility on the player's chunk. */
  setCenter(cx, cz) {
    if (cx === this.center.cx && cz === this.center.cz) return;
    this.center = { cx, cz };
    for (const entry of this.meshes.values()) {
      const lodIndex = this.lodFor(entry.cx, entry.cz);
      if (lodIndex !== entry.lod) {
        const lod = this.lods[lodIndex];
        for (const m of entry.inst) {
          m.geometry.setIndex(lod.index);
          m.geometry.setAttribute('position', lod.position);
        }
        entry.lod = lodIndex;
      }
      const deepVisible = this.isDeepVisible(entry.cx, entry.cz);
      for (const m of entry.deep) m.visible = deepVisible;
    }
  }

  clear() {
    for (const key of [...this.meshes.keys()]) this.remove(key);
  }

  stats() {
    let instances = 0;
    for (const e of this.meshes.values()) instances += e.count;
    return { chunks: this.meshes.size, instances };
  }
}
