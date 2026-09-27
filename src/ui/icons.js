// Draws little shaded-sphere icons for the hotbar and inventory.

import { BLOCKS, B, PATTERN } from '../blocks.js';
import { mulberry32 } from '../world/noise.js';

const cache = new Map();

function rgb(hex, f = 1) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function ball(ctx, cx, cy, r, color, color2, pattern, rand) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, rgb(color, 1.35));
  g.addColorStop(0.55, rgb(color, 1.0));
  g.addColorStop(1, rgb(color, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (pattern === PATTERN.SPECKLE || pattern === PATTERN.GRAIN || pattern === PATTERN.WOOL || pattern === PATTERN.MOTTLE || pattern === PATTERN.LEAVES) {
    const n = pattern === PATTERN.SPECKLE ? 7 : 14;
    const size = pattern === PATTERN.SPECKLE ? r * 0.18 : r * 0.1;
    ctx.fillStyle = rgb(color2, 1);
    ctx.globalAlpha = pattern === PATTERN.SPECKLE ? 0.95 : 0.45;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r * 0.85;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.6 + rand() * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === PATTERN.BARK || pattern === PATTERN.RIBS) {
    ctx.strokeStyle = rgb(color2, 1);
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = r * 0.12;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(i) * r * 0.32 + 0.01, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (pattern === PATTERN.BIRCH) {
    ctx.fillStyle = rgb(color2, 1);
    for (let i = 0; i < 5; i++) ctx.fillRect(cx - r + rand() * r * 1.4, cy - r + i * r * 0.42, r * 0.5, r * 0.1);
  } else if (pattern === PATTERN.BRICK || pattern === PATTERN.PLANKS) {
    ctx.strokeStyle = rgb(color2, pattern === PATTERN.BRICK ? 1 : 0.8);
    ctx.lineWidth = r * 0.1;
    ctx.globalAlpha = 0.85;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy + i * r * 0.55);
      ctx.lineTo(cx + r, cy + i * r * 0.55);
      ctx.stroke();
    }
  } else if (pattern === PATTERN.GLOW) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = rgb(color2, 1);
    ctx.beginPath();
    ctx.arc(cx + r * 0.2, cy + r * 0.25, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Specular highlight.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.38, cy - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function blockIcon(id, size = 64) {
  const key = `${id}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const def = BLOCKS[id];
  const rand = mulberry32(id * 7919 + 1);
  const s = size / 64;
  if (id === B.TALL_GRASS) {
    for (const [x, h] of [[22, 34], [33, 42], [44, 30]]) {
      const g = ctx.createLinearGradient(0, (58 - h) * s, 0, 58 * s);
      g.addColorStop(0, rgb(def.color, 1.3));
      g.addColorStop(1, rgb(def.color, 0.7));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x * s, (58 - h / 2) * s, 5 * s, (h / 2) * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === B.FLOWER_RED || id === B.FLOWER_YELLOW) {
    ctx.fillStyle = rgb(0x3f8f2a);
    ctx.beginPath();
    ctx.ellipse(32 * s, 44 * s, 3.5 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ball(ctx, 32 * s, 24 * s, 13 * s, def.color, def.color2, 0, rand);
  } else if (id === B.TORCH) {
    ctx.fillStyle = rgb(0x6b4a2a);
    ctx.beginPath();
    ctx.ellipse(32 * s, 42 * s, 5 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(32 * s, 20 * s, 0, 32 * s, 20 * s, 22 * s);
    glow.addColorStop(0, 'rgba(255,200,90,0.8)');
    glow.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    ball(ctx, 32 * s, 20 * s, 9 * s, def.color, def.color2, 0, rand);
  } else {
    ball(ctx, 32 * s, 32 * s, 26 * s, def.color, def.color2 ?? def.color, def.pattern, rand);
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
