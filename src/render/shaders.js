// GLSL for the ray-traced sphere impostors.
//
// Each sphere is drawn as a low-poly polyhedron that *circumscribes* the true sphere.
// The fragment shader intersects the view ray with the exact sphere (or ellipsoid),
// discards pixels that miss it and shades with the analytic normal, so spheres are
// perfectly round at any level of detail.

const HASH = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
`;

const NOISE = /* glsl */ `
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

// Sky gradient, shared by the sky dome and the fog so terrain fades into the sky.
export const SKY_GLSL = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uGlowColor;
uniform vec3 uGlowDir;

vec3 skyColor(vec3 d) {
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, uGround, smoothstep(0.0, -0.35, h));
  float sd = max(dot(d, uGlowDir), 0.0);
  col += uGlowColor * (pow(sd, 6.0) * 0.3 + pow(sd, 40.0) * 0.45);
  return col;
}
`;

export const TONEMAP_GLSL = /* glsl */ `
vec4 finalColor(vec3 col) {
#ifdef TONE_MAPPING
  col = toneMapping(col);
#endif
  return linearToOutputTexel(vec4(col, 1.0));
}
`;

// Lighting environment shared by every world material.
const ENV = /* glsl */ `
${SKY_GLSL}
${TONEMAP_GLSL}
uniform float uUnderwater;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uTorchColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowTexel;

float shadowAt(vec3 rel, vec3 n, float ndl) {
  if (uShadowOn < 0.5) return 1.0;
  float grazing = 1.0 - clamp(ndl, 0.0, 1.0);
  vec4 sc = uShadowMatrix * vec4(rel + n * (0.04 + 0.12 * grazing), 1.0);
  vec3 p = sc.xyz * 0.5 + 0.5;
  vec2 edge = abs(p.xy - 0.5);
  float fade = smoothstep(0.4, 0.49, max(edge.x, edge.y));
  if (fade >= 1.0 || p.z >= 1.0) return 1.0;
  float ref = p.z - (0.0002 + 0.0004 * grazing);
  float s = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      s += texture(uShadowMap, vec3(p.xy + vec2(float(i), float(j)) * uShadowTexel * 1.5, ref));
    }
  }
  s *= 1.0 / 9.0;
  return mix(s, 1.0, fade);
}

vec3 applyFog(vec3 col, vec3 rel) {
  float dist = length(rel);
  if (uUnderwater > 0.5) {
    return mix(col, uFogColor, 1.0 - exp(-dist * 0.085));
  }
  float f = smoothstep(uFogNear, uFogFar, dist);
  f = max(f, (1.0 - exp(-dist * 0.003)) * 0.3); // aerial perspective haze
  return mix(col, skyColor(rel / max(dist, 0.001)), f);
}
`;

// ----------------------------------------------------------------------------
// Sphere instances (solid blocks, plants, water, and the shadow depth pass)
// ----------------------------------------------------------------------------

export const sphereVertex = /* glsl */ `
attribute vec4 aPos;   // x, y, z (chunk local), block type
attribute vec4 aAoA;   // occlusion +x -x +y -y (0..255)
attribute vec4 aAoB;   // occlusion +z -z, packed light, shape

uniform sampler2D uPalette;
uniform vec4 uShapeOff[16];
uniform vec4 uShapeScale[16];
uniform float uTime;
uniform vec3 uBreakPos;
uniform float uBreak;

varying vec3 vUnit;
varying vec3 vView;
flat varying vec3 vScale;
#ifndef DEPTH
flat varying vec3 vColA;
flat varying vec3 vColB;
flat varying vec4 vMat;   // pattern, gloss, emissive, seed
flat varying vec3 vAoP;
flat varying vec3 vAoN;
flat varying vec2 vLight; // sky, block light
flat varying float vBreak;
#endif
#ifdef WATER
flat varying float vFall;
#endif

${HASH}

void main() {
  int type = int(aPos.w + 0.5);
  int shape = int(aAoB.w + 0.5);
  vec4 p2 = texelFetch(uPalette, ivec2(type, 2), 0);
  vec3 cellW = (modelMatrix * vec4(aPos.xyz, 1.0)).xyz;
  float seed = hash13(cellW * 1.37 + float(shape) * 7.31);

  vec3 center = aPos.xyz + 0.5;
  vec3 scale = vec3(p2.y);
#ifdef WATER
  float falling = float(shape);
  shape = 0;
#endif
  if (shape > 0) {
    vec4 so = uShapeOff[shape];
    vec4 ss = uShapeScale[shape];
    vec2 j = vec2(hash13(cellW + 1.7), hash13(cellW + 9.1)) - 0.5;
    float hv = 1.0 + (seed - 0.5) * ss.w;
    scale = ss.xyz * vec3(1.0, hv, 1.0);
    center += so.xyz + vec3(j.x * so.w, (hv - 1.0) * ss.y, j.y * so.w);
    if (shape <= 5) {
      center.xz += vec2(sin(uTime * 1.8 + cellW.x * 0.7 + cellW.z * 0.3), cos(uTime * 1.5 + cellW.z * 0.6)) * 0.02;
    }
  } else {
    scale *= 1.0 + (seed - 0.5) * 0.05;
  }
#ifdef WATER
  if (falling > 0.5) {
    center.xz += vec2(sin(uTime * 7.0 + cellW.y * 1.7), cos(uTime * 6.0 + cellW.y * 2.3)) * 0.03;
  } else {
    center.y += -WATER_DROP
      + sin(uTime * 1.6 + cellW.x * 0.8 + cellW.z * 0.5) * 0.035
      + sin(uTime * 1.13 - cellW.x * 0.35 + cellW.z * 1.1) * 0.025;
  }
  vFall = falling;
#endif

  float brk = 0.0;
  if (uBreak > 0.0) {
    vec3 dd = abs(cellW - uBreakPos);
    if (max(dd.x, max(dd.y, dd.z)) < 0.5) {
      brk = uBreak;
      scale *= 1.0 - 0.12 * brk;
      center += (vec3(hash13(cellW + uTime * 13.1), hash13(cellW + uTime * 7.7), hash13(cellW + uTime * 5.3)) - 0.5) * 0.05 * brk;
    }
  }

  vec4 world = modelMatrix * vec4(center + position * scale, 1.0);
  vView = world.xyz - cameraPosition;
  vUnit = position;
  vScale = scale;

#ifndef DEPTH
  vec4 p0 = texelFetch(uPalette, ivec2(type, 0), 0);
  vec4 p1 = texelFetch(uPalette, ivec2(type, 1), 0);
  vColA = p0.rgb;
  vColB = p1.rgb;
  vMat = vec4(p0.a, p1.a, p2.x, seed);
  vAoP = vec3(aAoA.x, aAoA.z, aAoB.x) / 255.0;
  vAoN = vec3(aAoA.y, aAoA.w, aAoB.y) / 255.0;
  float l = aAoB.z;
  vLight = vec2(floor(l / 16.0), mod(l, 16.0)) / 15.0;
  vBreak = brk;
#endif

  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const sphereFragment = /* glsl */ `
varying vec3 vUnit;
varying vec3 vView;
flat varying vec3 vScale;
flat varying vec3 vColA;
flat varying vec3 vColB;
flat varying vec4 vMat;
flat varying vec3 vAoP;
flat varying vec3 vAoN;
flat varying vec2 vLight;
flat varying float vBreak;
#ifdef WATER
flat varying float vFall;
#endif

${ENV}
${HASH}
${NOISE}

vec3 patternAlbedo(int pt, vec3 a, vec3 b, vec3 q, float seed) {
  vec3 col = a;
  if (pt == 1) {            // speckle (ores, cobble, gravel)
    float nn = vnoise(q * 3.4 + seed * 31.0);
    col = mix(a, b, smoothstep(0.64, 0.72, nn));
  } else if (pt == 2) {     // bark
    float ang = atan(q.z, q.x);
    float st = vnoise(vec3(ang * 2.6, q.y * 1.3, seed * 13.0));
    col = mix(a, b, smoothstep(0.42, 0.75, st));
  } else if (pt == 3) {     // mottled
    float nn = vnoise(q * 2.3 + seed * 17.0);
    col = mix(a, b, smoothstep(0.35, 0.85, nn) * 0.85);
  } else if (pt == 4) {     // grain
    float nn = vnoise(q * 9.0 + seed * 7.0);
    col = mix(a, b, nn * 0.65);
  } else if (pt == 5) {     // birch
    float ang = atan(q.z, q.x);
    float band = vnoise(vec3(ang * 2.2, q.y * 8.0, seed * 5.0));
    col = mix(a, b, smoothstep(0.76, 0.8, band));
  } else if (pt == 6) {     // bricks
    float rows = q.y * 2.0 + 2.0;
    float r = floor(rows);
    float ang = atan(q.z, q.x) / 6.28318 * 6.0 + r * 0.5;
    float mortar = max(step(fract(ang), 0.07), step(fract(rows), 0.1));
    col = mix(a, b, mortar);
  } else if (pt == 7) {     // planks
    float rows = q.y * 2.5 + 3.0;
    float grain = vnoise(vec3(q.x * 5.0, rows, q.z * 5.0) + seed * 3.0);
    col = mix(a, b, max(step(fract(rows), 0.08), grain * 0.35));
  } else if (pt == 8) {     // leaves
    float nn = vnoise(q * 3.0 + seed * 11.0);
    col = mix(a, b, smoothstep(0.3, 0.75, nn) * 0.75);
  } else if (pt == 9) {     // glow
    float nn = vnoise(q * 2.5 + vec3(0.0, uTime * 0.4, seed * 5.0));
    col = mix(a, b, nn);
  } else if (pt == 10) {    // grass: darker underneath
    col = mix(b, a, smoothstep(-0.7, 0.45, q.y));
  } else if (pt == 11) {    // cactus ribs
    float rib = abs(sin(atan(q.z, q.x) * 4.0));
    col = mix(b, a, smoothstep(0.08, 0.5, rib));
  } else if (pt == 12) {    // wool
    col = mix(a, b, vnoise(q * 7.0 + seed * 3.0) * 0.55);
  } else if (pt == 13) {    // snow
    col = mix(b, a, smoothstep(-0.6, 0.4, q.y));
  }
  return col * (0.92 + seed * 0.16);
}

void main() {
  vec3 rd = normalize(vView);
  vec3 rdu = rd / vScale;
  float a = dot(rdu, rdu);
  float b = dot(vUnit, rdu);
  float c = dot(vUnit, vUnit) - 1.0;
  float disc = b * b - a * c;
  if (disc < 0.0) discard;
  float t = (-b - sqrt(disc)) / a;
  vec3 q = vUnit + t * rdu;             // point on the unit sphere
  vec3 n = normalize(q / vScale);       // world-space normal
  vec3 rel = vView + t * rd;            // hit position relative to the camera

  float seed = vMat.w;
  vec3 albedo = patternAlbedo(int(vMat.x + 0.5), vColA, vColB, q, seed);

#ifdef WATER
  if (vFall > 0.5) {
    float streak = fract(q.y * 1.4 + uTime * 2.4 + seed * 5.0 + floor(atan(q.z, q.x) * 1.5) * 0.37);
    albedo = mix(albedo, vec3(0.75, 0.88, 1.0), smoothstep(0.55, 1.0, streak) * 0.55);
  }
#endif
  if (vBreak > 0.0) {
    float cr = vnoise(q * 4.5 + 3.0);
    float line = 1.0 - smoothstep(0.0, 0.04 + 0.05 * vBreak, abs(cr - 0.5));
    albedo *= 1.0 - line * min(1.0, vBreak * 1.6) * 0.75;
  }

  // Contact occlusion from the 3x3 neighbourhood on each side.
  vec3 n2 = n * n;
  vec3 occ = mix(vAoN, vAoP, step(0.0, n));
  float ao = dot(n2, occ);
  float aoF = 1.0 - 0.82 * ao * ao * (3.0 - 2.0 * ao);

  float sky = vLight.x;
  float torch = vLight.y;
  float ndl = dot(n, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(rel, n, ndl) : 0.0;
  vec3 hemi = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  vec3 light = hemi * aoF * sky + vec3(0.018) * aoF;
  light += uSunColor * max(ndl, 0.0) * sh * sky * mix(aoF, 1.0, 0.45);
  light += uTorchColor * torch * torch * (0.3 + 0.7 * aoF);

  vec3 V = -rd;
  float gloss = vMat.y;
#ifdef WATER
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 col = albedo * light * 0.9;
  col += mix(uFogColor, uSkyAmb * 1.6, 0.5) * fres * 0.55 * sky;
#else
  vec3 col = albedo * light;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  col += uSkyAmb * fres * gloss * 0.3 * sky * aoF;
#endif
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(n, H), 0.0), mix(12.0, 110.0, gloss)) * gloss * 0.7;
  col += uSunColor * spec * sh * sky;
  col += albedo * vMat.z;

  col = applyFog(col, rel);
  gl_FragColor = finalColor(col);
}
`;

export const depthFragment = /* glsl */ `
uniform vec3 uLightRay;
uniform float uDepthScale;
varying vec3 vUnit;
flat varying vec3 vScale;

void main() {
  vec3 rdu = uLightRay / vScale;
  float a = dot(rdu, rdu);
  float b = dot(vUnit, rdu);
  float c = dot(vUnit, vUnit) - 1.0;
  float disc = b * b - a * c;
  if (disc < 0.0) discard;
  float t = (-b - sqrt(disc)) / a;
  gl_FragDepth = gl_FragCoord.z + max(t, 0.0) * uDepthScale;
  gl_FragColor = vec4(1.0);
}
`;

// ----------------------------------------------------------------------------
// Crevice sealer quads
// ----------------------------------------------------------------------------

export const sealVertex = /* glsl */ `
attribute vec4 aSeal; // type, packed light
uniform sampler2D uPalette;
varying vec3 vView;
flat varying vec3 vCol;
flat varying vec2 vLight;

void main() {
  int type = int(aSeal.x + 0.5);
  vCol = texelFetch(uPalette, ivec2(type, 0), 0).rgb;
  float l = aSeal.y;
  vLight = vec2(floor(l / 16.0), mod(l, 16.0)) / 15.0;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 v = world.xyz - cameraPosition;
  // Push the quad slightly away from the viewer so it never fights the spheres.
  world.xyz += v * (SEAL_PUSH / max(length(v), 0.001));
  vView = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const sealFragment = /* glsl */ `
varying vec3 vView;
flat varying vec3 vCol;
flat varying vec2 vLight;
${ENV}

void main() {
  float d = length(vView);
  float sky = vLight.x;
  float torch = vLight.y;
  vec3 amb = uSkyAmb * sky + uTorchColor * torch * torch + 0.015;
#ifdef WATER
  vec3 col = vCol * (amb * 0.55 + uSunColor * sky * 0.2);
#else
  vec3 near = vCol * amb * 0.28;
  vec3 far = vCol * (amb * 0.75 + uSunColor * sky * 0.3);
  vec3 col = mix(near, far, smoothstep(10.0, 90.0, d) * 0.8);
#endif
  col = applyFog(col, vView);
  gl_FragColor = finalColor(col);
}
`;

// Sealer quads also cast shadows so light doesn't leak through the gaps between spheres.
export const sealDepthVertex = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const sealDepthFragment = /* glsl */ `
void main() {
  gl_FragColor = vec4(1.0);
}
`;

// ----------------------------------------------------------------------------
// Target highlight: a glassy outline shell around the block being looked at.
// ----------------------------------------------------------------------------

export const highlightVertex = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uScale;
varying vec3 vUnit;
varying vec3 vView;
void main() {
  vec4 world = vec4(uCenter + position * uScale, 1.0);
  vView = world.xyz - cameraPosition;
  vUnit = position;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const highlightFragment = /* glsl */ `
uniform vec3 uScale;
uniform float uPulse;
varying vec3 vUnit;
varying vec3 vView;
void main() {
  vec3 rd = normalize(vView);
  vec3 rdu = rd / uScale;
  float a = dot(rdu, rdu);
  float b = dot(vUnit, rdu);
  float c = dot(vUnit, vUnit) - 1.0;
  float disc = b * b - a * c;
  if (disc < 0.0) discard;
  float t = (-b - sqrt(disc)) / a;
  vec3 n = normalize((vUnit + t * rdu) / uScale);
  float rim = 1.0 - abs(dot(n, rd));
  float alpha = smoothstep(0.45, 0.92, rim) * 0.75 + 0.05 + uPulse * 0.08;
  vec3 col = mix(vec3(0.02), vec3(1.0), smoothstep(0.8, 1.0, rim) * 0.6);
  gl_FragColor = vec4(col, alpha);
}
`;
