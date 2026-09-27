// GLSL for the ray-traced sphere impostors.
//
// Each sphere is drawn as a low-poly polyhedron that *circumscribes* the true sphere
// (or ellipsoid). The fragment shader intersects the view ray with the exact shape,
// discards pixels that miss it and shades with the analytic normal, so spheres are
// perfectly round at any level of detail. Materials are procedural: every block
// pattern has an albedo, a height field (for bump mapping) and a specular mask.

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
#ifdef NO_SHADOW
  return 1.0;
#else
  if (uShadowOn < 0.5) return 1.0;
  float grazing = 1.0 - clamp(ndl, 0.0, 1.0);
  vec4 sc = uShadowMatrix * vec4(rel + n * (0.04 + 0.12 * grazing), 1.0);
  vec3 p = sc.xyz * 0.5 + 0.5;
  vec2 edge = abs(p.xy - 0.5);
  float fade = smoothstep(0.4, 0.49, max(edge.x, edge.y));
  if (fade >= 1.0 || p.z >= 1.0) return 1.0;
  float ref = p.z - (0.0002 + 0.0004 * grazing);
  // Four bilinear hardware-PCF taps give a smooth 3x3-texel kernel.
  vec2 o = vec2(uShadowTexel * 0.75);
  float s = texture(uShadowMap, vec3(p.xy + vec2(-o.x, -o.y), ref))
          + texture(uShadowMap, vec3(p.xy + vec2(o.x, -o.y), ref))
          + texture(uShadowMap, vec3(p.xy + vec2(-o.x, o.y), ref))
          + texture(uShadowMap, vec3(p.xy + vec2(o.x, o.y), ref));
  return mix(s * 0.25, 1.0, fade);
#endif
}

vec3 applyFog(vec3 col, vec3 rel) {
#ifdef NO_FOG
  return col;
#else
  float dist = length(rel);
  if (uUnderwater > 0.5) {
    return mix(col, uFogColor, 1.0 - exp(-dist * 0.085));
  }
  float f = smoothstep(uFogNear, uFogFar, dist);
  f = max(f, (1.0 - exp(-dist * 0.003)) * 0.3); // aerial perspective haze
  return mix(col, skyColor(rel / max(dist, 0.001)), f);
#endif
}
`;

// Procedural materials. q is the point on the unit sphere (object space).
const MATERIALS = /* glsl */ `
float matHeight(int pt, vec3 q, float seed) {
  if (pt == 3) return vnoise(q * 6.0 + seed * 7.0) * 0.6 + vnoise(q * 14.0) * 0.4;                // mottle
  if (pt == 23) { float v = vnoise(q * 4.2 + seed * 9.0); return smoothstep(0.25, 0.75, v); }      // cobble lumps
  if (pt == 2) { float a = atan(q.z, q.x); return smoothstep(0.3, 0.8, vnoise(vec3(a * 5.0, q.y * 2.0, seed * 3.0))); } // bark grooves
  if (pt == 7) return smoothstep(0.0, 0.1, fract(q.y * 2.5 + 3.0)) * 0.8 + vnoise(vec3(q.x * 9.0, q.y * 2.0, q.z * 9.0)) * 0.2; // planks
  if (pt == 4) return vnoise(q * 16.0 + seed * 5.0);                                                 // grain
  if (pt == 8) return vnoise(q * 5.0 + seed * 11.0);                                                 // leaves
  if (pt == 6) { float rows = q.y * 2.0 + 2.0; float ang = atan(q.z, q.x) / 6.28318 * 6.0 + floor(rows) * 0.5;
                 return min(smoothstep(0.0, 0.08, fract(ang)), smoothstep(0.0, 0.1, fract(rows))); } // bricks
  if (pt == 21 || pt == 1) return vnoise(q * 5.0 + seed * 3.0) * 0.5 + smoothstep(0.62, 0.72, vnoise(q * 3.4 + seed * 31.0)) * 0.5; // ore
  if (pt == 11) return abs(sin(atan(q.z, q.x) * 4.0));                                              // ribs
  if (pt == 12) return vnoise(q * 20.0 + seed * 2.0);                                                // wool fuzz
  if (pt == 19) return 0.5 + 0.5 * sin(q.x * 12.0 + vnoise(q * 3.0) * 2.0);                          // farmland furrows
  if (pt == 13) return vnoise(q * 10.0);                                                             // snow
  if (pt == 10) return vnoise(q * 12.0 + seed * 4.0);                                                // grass fuzz
  if (pt == 16 || pt == 17 || pt == 18 || pt == 20) return smoothstep(0.0, 0.08, fract(q.y * 2.0 + 0.5)); // bands
  return 0.5;
}

// Returns albedo; spec receives an extra specular mask (glints, wet spots).
vec3 matAlbedo(int pt, vec3 a, vec3 b, vec3 q, float seed, float far, out float spec) {
  spec = 1.0;
  vec3 col = a;
  if (far > 0.99) {
    // Distant spheres: skip the noise, use the average colour.
    col = mix(a, b, (pt == 10 || pt == 13) ? 0.2 : 0.3);
  } else if (pt == 1 || pt == 21) {        // speckle / ore
    float nn = vnoise(q * 3.4 + seed * 31.0);
    float m = smoothstep(0.62, 0.7, nn);
    col = mix(a * (0.85 + 0.3 * vnoise(q * 6.0)), b, m);
    spec = 0.6 + m * 2.5;
  } else if (pt == 2) {                    // bark
    float ang = atan(q.z, q.x);
    col = mix(a, b, smoothstep(0.35, 0.8, vnoise(vec3(ang * 5.0, q.y * 2.0, seed * 3.0))));
  } else if (pt == 3) {                    // mottled
    col = mix(a, b, smoothstep(0.3, 0.85, vnoise(q * 2.3 + seed * 17.0)) * 0.9);
  } else if (pt == 23) {                   // cobble
    float v = vnoise(q * 4.2 + seed * 9.0);
    col = mix(b, a, smoothstep(0.2, 0.7, v)) * (0.9 + 0.2 * vnoise(q * 11.0));
  } else if (pt == 4) {                    // grain
    col = mix(a, b, vnoise(q * 9.0 + seed * 7.0) * 0.7);
    spec = 0.7 + step(0.985, hash13(floor(q * 40.0) + seed)) * 6.0;
  } else if (pt == 5) {                    // birch
    float ang = atan(q.z, q.x);
    col = mix(a, b, smoothstep(0.74, 0.8, vnoise(vec3(ang * 2.2, q.y * 8.0, seed * 5.0))));
  } else if (pt == 6) {                    // bricks
    float rows = q.y * 2.0 + 2.0;
    float ang = atan(q.z, q.x) / 6.28318 * 6.0 + floor(rows) * 0.5;
    float mortar = max(step(fract(ang), 0.07), step(fract(rows), 0.1));
    col = mix(a * (0.85 + 0.3 * hash13(vec3(floor(ang), floor(rows), seed))), b, mortar);
  } else if (pt == 7) {                    // planks
    float rows = q.y * 2.5 + 3.0;
    float grain = vnoise(vec3(q.x * 5.0, rows, q.z * 5.0) + seed * 3.0);
    col = mix(a * (0.9 + 0.2 * hash13(vec3(floor(rows), seed, 1.0))), b, max(step(fract(rows), 0.08), grain * 0.35));
  } else if (pt == 8) {                    // leaves
    float nn = vnoise(q * 3.0 + seed * 11.0);
    col = mix(a, b, smoothstep(0.3, 0.75, nn) * 0.8);
    col *= 0.9 + 0.25 * vnoise(q * 9.0);
  } else if (pt == 9) {                    // glow
    col = mix(a, b, vnoise(q * 2.5 + vec3(0.0, uTime * 0.4, seed * 5.0)));
  } else if (pt == 10) {                   // grass: darker underneath, fine fuzz
    col = mix(b, a, smoothstep(-0.7, 0.45, q.y)) * (0.92 + 0.16 * vnoise(q * 12.0 + seed * 4.0));
  } else if (pt == 11) {                   // ribs
    col = mix(b, a, smoothstep(0.08, 0.5, abs(sin(atan(q.z, q.x) * 4.0))));
  } else if (pt == 12) {                   // wool
    col = mix(a, b, vnoise(q * 7.0 + seed * 3.0) * 0.55);
    spec = 0.2;
  } else if (pt == 13) {                   // snow + glitter
    col = mix(b, a, smoothstep(-0.6, 0.4, q.y));
    spec = 0.5 + step(0.97, hash13(floor(q * 34.0))) * 8.0;
  } else if (pt == 16) {                   // crafting table: planks + tool grid on top
    float rows = fract(q.y * 2.0 + 0.5);
    col = mix(a, b, step(rows, 0.08));
    if (q.y > 0.55) col = mix(a * 1.1, b, step(0.8, max(abs(sin(q.x * 9.0)), abs(sin(q.z * 9.0)))));
  } else if (pt == 17) {                   // furnace: stone with glowing mouth
    col = mix(a, a * 0.8, vnoise(q * 5.0));
    float mouth = step(abs(q.y + 0.1), 0.22) * step(0.5, abs(q.z)) ;
    col = mix(col, b, mouth);
  } else if (pt == 18) {                   // chest: wood with dark band and latch
    col = mix(a, b, step(abs(q.y - 0.1), 0.06));
    if (abs(q.y - 0.1) < 0.12 && abs(atan(q.z, q.x)) < 0.25) col = vec3(0.8, 0.8, 0.85);
  } else if (pt == 19) {                   // farmland
    col = mix(a, b, 0.5 + 0.5 * sin(q.x * 12.0 + vnoise(q * 3.0) * 2.0));
    spec = 1.4;
  } else if (pt == 20) {                   // powder keg
    col = mix(a, b, step(abs(fract(q.y * 2.0 + 0.5) - 0.5), 0.06));
  } else if (pt == 22) {                   // ice cracks
    col = mix(a, b, smoothstep(0.02, 0.0, abs(vnoise(q * 4.0) - 0.5)));
  } else if (pt == 24) {                   // hide spots (cows)
    col = mix(a, b, smoothstep(0.55, 0.6, vnoise(q * 2.6 + seed * 13.0)));
  } else if (pt == 25) {                   // brushed metal
    col = mix(a, b, vnoise(vec3(q.x * 2.0, q.y * 30.0, q.z * 2.0)) * 0.4);
    spec = 1.5;
  }
  return col * (0.93 + seed * 0.14);
}

// Bump: perturb the normal with the gradient of the material height field.
vec3 bumpNormal(int pt, vec3 n, vec3 q, float seed, float strength) {
  if (strength <= 0.001) return n;
  vec3 t1 = normalize(cross(abs(q.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0), q));
  vec3 t2 = cross(q, t1);
  float e = 0.035;
  float h0 = matHeight(pt, q, seed);
  float h1 = matHeight(pt, normalize(q + t1 * e), seed);
  float h2 = matHeight(pt, normalize(q + t2 * e), seed);
  vec3 g = (t1 * (h1 - h0) + t2 * (h2 - h0)) / e;
  return normalize(n - g * strength * 0.12);
}
`;

// Shared lighting for opaque spheres.
const SHADE = /* glsl */ `
vec3 shadeOpaque(int pt, vec3 albedo, float specMask, vec3 n, vec3 rel, vec3 rd, float aoF,
                 float sky, float torch, float gloss, float emissive) {
  float ndl = dot(n, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(rel, n, ndl) : 0.0;
  vec3 hemi = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  vec3 light = hemi * aoF * sky + vec3(0.018) * aoF;
  light += uSunColor * max(ndl, 0.0) * sh * sky * mix(aoF, 1.0, 0.45);
  light += uTorchColor * torch * torch * (0.3 + 0.7 * aoF);
  vec3 col = albedo * light;
  vec3 V = -rd;
  float nv = max(dot(n, V), 0.0);
  float fres = pow(1.0 - nv, 4.0);
  col += uSkyAmb * fres * gloss * 0.35 * sky * aoF;
  if (pt == 8) col += albedo * uSunColor * max(-ndl, 0.0) * 0.35 * sky;         // leaves let light through
  if (pt == 12 || pt == 10) col += albedo * pow(1.0 - nv, 3.0) * 0.25 * (sky + torch); // fuzzy sheen
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(n, H), 0.0), mix(12.0, 120.0, gloss)) * gloss * 0.7 * specMask;
  col += uSunColor * spec * sh * sky;
  col += uTorchColor * pow(max(dot(n, V), 0.0), 40.0) * gloss * torch * 0.2 * specMask;
  col += albedo * emissive;
  return col;
}

// Glassy / liquid shading: reflection of the sky plus a tinted body, returns alpha in .a
vec4 shadeClear(int pt, vec3 a, vec3 b, vec3 n, vec3 q, vec3 rel, vec3 rd, float sky, float torch,
                float baseAlpha, float seed, float falling) {
  vec3 V = -rd;
  if (pt == 14) {
    // Animated ripples on the water surface.
    vec3 p = q * 2.0 + vec3(uTime * 0.35, uTime * 0.5, -uTime * 0.3);
    vec3 w = vec3(vnoise(p + 7.0), vnoise(p + 13.0), vnoise(p + 29.0)) - 0.5;
    n = normalize(n + w * 0.35);
  }
  float nv = max(dot(n, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
  vec3 refl = skyColor(reflect(rd, n)) * (0.25 + 0.75 * sky) + uTorchColor * torch * 0.2;
  vec3 hemi = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5) * sky + uTorchColor * torch * torch * 0.6 + 0.02;
  float ndl = max(dot(n, uSunDir), 0.0);
  float sh = ndl > 0.0 ? shadowAt(rel, n, ndl) : 0.0;
  vec3 body = mix(b, a, 0.5 + 0.5 * n.y) * (hemi + uSunColor * ndl * sh * 0.5 * sky);
  float alpha = baseAlpha;
  if (pt == 14 && falling > 0.5) {
    float streak = fract(q.y * 1.3 + uTime * 2.6 + seed * 5.0 + floor(atan(q.z, q.x) * 2.0) * 0.37);
    float foam = smoothstep(0.5, 1.0, streak);
    body = mix(body, (hemi + uSunColor * 0.4 * sky) * 1.1, foam * 0.6);
    alpha = mix(alpha, 0.85, foam);
  }
  if (pt == 22) body *= 0.9 + 0.3 * smoothstep(0.03, 0.0, abs(vnoise(q * 4.0) - 0.5));
  vec3 col = mix(body, refl, fres);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(n, H), 0.0), 220.0) * 2.5 * sh * sky;
  return vec4(col, clamp(alpha + fres * 0.6, 0.0, 0.95));
}
`;

// ----------------------------------------------------------------------------
// Terrain sphere instances (solid blocks, plants, translucent water/glass, depth)
// ----------------------------------------------------------------------------

export const sphereVertex = /* glsl */ `
attribute vec4 aPos;   // x, y, z (chunk local), block type
attribute vec4 aAoA;   // occlusion +x -x +y -y (0..255)
attribute vec4 aAoB;   // occlusion +z -z, packed light, shape (falling flag for water)

uniform sampler2D uPalette;
uniform vec4 uShapeOff[16];
uniform vec4 uShapeScale[16];
uniform float uTime;
uniform vec3 uBreakPos;
uniform float uBreak;
uniform vec4 uRipples[6]; // x, z, start time, strength

varying vec3 vUnit;
varying vec3 vView;
flat varying vec3 vScale;
#ifndef DEPTH
flat varying vec3 vColA;
flat varying vec3 vColB;
flat varying vec4 vMat;   // pattern, gloss, emissive, seed
flat varying vec4 vMat2;  // alpha, bump, falling, -
flat varying vec3 vAoP;
flat varying vec3 vAoN;
flat varying vec2 vLight; // sky, block light
flat varying float vBreak;
#endif

${HASH}

void main() {
  int type = int(aPos.w + 0.5);
  int shape = int(aAoB.w + 0.5);
  vec4 p2 = texelFetch(uPalette, ivec2(type, 2), 0);
  vec4 p3 = texelFetch(uPalette, ivec2(type, 3), 0);
  vec3 cellW = (modelMatrix * vec4(aPos.xyz, 1.0)).xyz;
  float seed = hash13(cellW * 1.37 + float(shape) * 7.31);

  vec3 center = aPos.xyz + 0.5;
  vec3 scale = vec3(p2.y);
  float falling = 0.0;
  float level = p3.x;
  if (level > 0.0) {
    falling = float(shape);
    shape = 0;
  }
  if (shape > 0) {
    vec4 so = uShapeOff[shape];
    vec4 ss = uShapeScale[shape];
    vec2 j = vec2(hash13(cellW + 1.7), hash13(cellW + 9.1)) - 0.5;
    float hv = 1.0 + (seed - 0.5) * ss.w;
    scale = ss.xyz * vec3(1.0, hv, 1.0);
    center += so.xyz + vec3(j.x * so.w, (hv - 1.0) * ss.y, j.y * so.w);
    if (shape <= 5 || (shape >= 9 && shape <= 13)) {
      center.xz += vec2(sin(uTime * 1.8 + cellW.x * 0.7 + cellW.z * 0.3), cos(uTime * 1.5 + cellW.z * 0.6)) * 0.02;
    }
  } else {
    scale *= 1.0 + (seed - 0.5) * 0.05;
  }
  if (level > 0.0) {
    if (falling > 0.5) {
      center.xz += vec2(sin(uTime * 7.0 + cellW.y * 1.7), cos(uTime * 6.0 + cellW.y * 2.3)) * 0.035;
      center.y += fract(uTime * 1.5 + seed) * 0.0;
    } else if (level < 7.5) {
      // Flowing water: smaller balls resting on the ground, jiggling as they run.
      center.y += -0.5 + scale.y + sin(uTime * 5.0 + cellW.x * 1.3 + cellW.z * 1.7) * 0.03;
    } else {
      center.y += -WATER_DROP
        + sin(uTime * 1.6 + cellW.x * 0.8 + cellW.z * 0.5) * 0.035
        + sin(uTime * 1.13 - cellW.x * 0.35 + cellW.z * 1.1) * 0.025;
      for (int i = 0; i < 6; i++) {
        vec4 r = uRipples[i];
        float age = uTime - r.z;
        if (r.w <= 0.0 || age < 0.0 || age > 3.0) continue;
        float d = length(cellW.xz + 0.5 - r.xy);
        float ring = age * 3.5;
        center.y += cos((d - ring) * 2.2) * exp(-pow(d - ring, 2.0) * 0.6) * exp(-age * 1.4) * r.w * 0.18;
      }
    }
  }

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
  vMat2 = vec4(p2.z, p2.w, falling, 0.0);
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
flat varying vec4 vMat2;
flat varying vec3 vAoP;
flat varying vec3 vAoN;
flat varying vec2 vLight;
flat varying float vBreak;

${ENV}
${HASH}
${NOISE}
${MATERIALS}
${SHADE}

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
  float dist = length(rel);

  int pt = int(vMat.x + 0.5);
  float seed = vMat.w;

#ifdef TRANSLUCENT
  vec4 cc = shadeClear(pt, vColA, vColB, n, q, rel, rd, vLight.x, vLight.y, vMat2.x, seed, vMat2.z);
  vec3 col = applyFog(cc.rgb, rel);
  gl_FragColor = vec4(finalColor(col).rgb, cc.a);
#else
  float far = smoothstep(55.0, 75.0, dist);
  float specMask;
  vec3 albedo = matAlbedo(pt, vColA, vColB, q, seed, far, specMask);
  // Relief only where it can be seen.
  float bumpAmt = vMat2.y * (1.0 - smoothstep(18.0, 32.0, dist));
  n = bumpNormal(pt, n, q, seed, bumpAmt);

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

  vec3 col = shadeOpaque(pt, albedo, specMask, n, rel, rd, aoF, vLight.x, vLight.y, vMat.y, vMat.z);
  col = applyFog(col, rel);
  gl_FragColor = finalColor(col);
#endif
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
// Entity ellipsoids: mobs, dropped items, arrows and the first-person hand.
// Each instance has its own centre, radii, rotation (quaternion) and material.
// ----------------------------------------------------------------------------

const QUAT = /* glsl */ `
vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
`;

export const entityVertex = /* glsl */ `
attribute vec3 iCenter;
attribute vec3 iScale;
attribute vec4 iQuat;
attribute vec3 iColor;
attribute vec4 iMat;    // palette type (-1 = use colour), pattern, gloss, emissive
attribute vec4 iLight;  // sky, block light, hurt flash, seed

uniform sampler2D uPalette;

varying vec3 vUnit;
varying vec3 vView;
flat varying vec3 vScale;
flat varying vec4 vQuat;
#ifndef DEPTH
flat varying vec3 vColA;
flat varying vec3 vColB;
flat varying vec4 vMat;
flat varying vec4 vLight;
#endif

${QUAT}

void main() {
  vec4 world = vec4(iCenter + qrot(iQuat, position * iScale), 1.0);
  vView = world.xyz - cameraPosition;
  vUnit = position;
  vScale = iScale;
  vQuat = iQuat;
#ifndef DEPTH
  if (iMat.x >= 0.0) {
    vec4 p0 = texelFetch(uPalette, ivec2(int(iMat.x + 0.5), 0), 0);
    vec4 p1 = texelFetch(uPalette, ivec2(int(iMat.x + 0.5), 1), 0);
    vColA = p0.rgb;
    vColB = p1.rgb;
    vMat = vec4(p0.a, p1.a, iMat.w, 0.0);
  } else {
    vColA = iColor;
    vColB = iColor * 0.62;
    vMat = vec4(iMat.y, iMat.z, iMat.w, 0.0);
  }
  vLight = iLight;
#endif
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const entityFragment = /* glsl */ `
varying vec3 vUnit;
varying vec3 vView;
flat varying vec3 vScale;
flat varying vec4 vQuat;
flat varying vec3 vColA;
flat varying vec3 vColB;
flat varying vec4 vMat;
flat varying vec4 vLight;

${ENV}
${HASH}
${NOISE}
${MATERIALS}
${SHADE}
${QUAT}

void main() {
  vec4 iq = vec4(-vQuat.xyz, vQuat.w);
  vec3 rdw = normalize(vView);
  vec3 rdu = qrot(iq, rdw) / vScale;
  float a = dot(rdu, rdu);
  float b = dot(vUnit, rdu);
  float c = dot(vUnit, vUnit) - 1.0;
  float disc = b * b - a * c;
  if (disc < 0.0) discard;
  float t = (-b - sqrt(disc)) / a;
  vec3 q = vUnit + t * rdu;
  vec3 n = normalize(qrot(vQuat, q / vScale));
  vec3 rel = vView + t * rdw;
  int pt = int(vMat.x + 0.5);
  float seed = vLight.w;
  float specMask;
  vec3 albedo = matAlbedo(pt, vColA, vColB, q, seed, 0.0, specMask);
  n = bumpNormal(pt, n, q, seed, 0.25 * (1.0 - smoothstep(10.0, 20.0, length(rel))));
  albedo = mix(albedo, vec3(1.0, 0.15, 0.1), vLight.z * 0.6);
  float aoF = 1.0 - 0.3 * smoothstep(0.2, -0.9, n.y);
  vec3 col = shadeOpaque(pt, albedo, specMask, n, rel, rdw, aoF, vLight.x, vLight.y, vMat.y, vMat.z);
  col += vec3(1.0, 0.3, 0.2) * vLight.z * 0.25;
  col = applyFog(col, rel);
  gl_FragColor = finalColor(col);
}
`;

export const entityDepthFragment = /* glsl */ `
uniform vec3 uLightRay;
uniform float uDepthScale;
varying vec3 vUnit;
flat varying vec3 vScale;
flat varying vec4 vQuat;
${QUAT}
void main() {
  vec4 iq = vec4(-vQuat.xyz, vQuat.w);
  vec3 rdu = qrot(iq, uLightRay) / vScale;
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
// Clouds: soft white spheres, dithered out with distance (no sorting needed).
// ----------------------------------------------------------------------------

export const cloudVertex = /* glsl */ `
attribute vec4 iSphere; // centre (tile local) + radius
uniform float uTime;
varying vec3 vUnit;
varying vec3 vView;
flat varying float vRadius;
flat varying float vSeed;
void main() {
  vec3 center = iSphere.xyz;
  center.y += sin(uTime * 0.2 + center.x * 0.05) * 0.6;
  vec4 world = modelMatrix * vec4(center + position * iSphere.w, 1.0);
  vView = world.xyz - cameraPosition;
  vUnit = position;
  vRadius = iSphere.w;
  vSeed = fract(sin(dot(center, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const cloudFragment = /* glsl */ `
uniform vec3 uCloudColor;
uniform vec3 uCloudShade;
uniform vec3 uSunDir;
uniform float uFade;
uniform float uAlpha;
varying vec3 vUnit;
varying vec3 vView;
flat varying float vRadius;
flat varying float vSeed;
${TONEMAP_GLSL}
void main() {
  vec3 rd = normalize(vView);
  float b = dot(vUnit, rd);
  float c = dot(vUnit, vUnit) - 1.0;
  float disc = b * b - c;
  if (disc < 0.0) discard;
  float t = -b - sqrt(disc);
  vec3 n = normalize(vUnit + t * rd);
  // Dithered fade: far clouds and cloud edges dissolve without sorting.
  float d = length(vView.xz);
  float keep = (1.0 - smoothstep(uFade * 0.55, uFade, d)) * uAlpha;
  keep *= smoothstep(0.0, 0.35, -dot(n, rd));
  vec2 px = floor(gl_FragCoord.xy);
  float dither = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  if (keep < dither) discard;
  float wrap = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  float up = n.y * 0.5 + 0.5;
  vec3 col = mix(uCloudShade, uCloudColor, wrap * 0.6 + up * 0.4);
  col *= 0.94 + vSeed * 0.08;
  gl_FragColor = finalColor(col);
}
`;

// ----------------------------------------------------------------------------
// Crevice sealer quads
// ----------------------------------------------------------------------------

export const sealVertex = /* glsl */ `
attribute vec4 aSeal; // type, packed light
uniform sampler2D uPalette;
uniform float uTime;
varying vec3 vView;
flat varying vec3 vCol;
flat varying vec2 vLight;

void main() {
  int type = int(aSeal.x + 0.5);
  vCol = texelFetch(uPalette, ivec2(type, 0), 0).rgb;
  float l = aSeal.y;
  vLight = vec2(floor(l / 16.0), mod(l, 16.0)) / 15.0;
  vec4 world = modelMatrix * vec4(position, 1.0);
#ifdef WATER
  world.y += sin(uTime * 1.6 + world.x * 0.8 + world.z * 0.5) * 0.02;
#endif
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
  // Translucent water surface between the water spheres.
  vec3 rd = vView / max(d, 0.001);
  float fres = 0.04 + 0.96 * pow(1.0 - abs(rd.y), 5.0);
  vec3 refl = skyColor(reflect(rd, vec3(0.0, 1.0, 0.0))) * (0.25 + 0.75 * sky);
  vec3 col = mix(vCol * (amb * 0.6 + uSunColor * sky * 0.25), refl, fres);
  col = applyFog(col, vView);
  gl_FragColor = vec4(finalColor(col).rgb, 0.14 + fres * 0.55);
#else
  vec3 near = vCol * amb * 0.28;
  vec3 far = vCol * (amb * 0.75 + uSunColor * sky * 0.3);
  vec3 col = mix(near, far, smoothstep(10.0, 90.0, d) * 0.8);
  col = applyFog(col, vView);
  gl_FragColor = finalColor(col);
#endif
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
