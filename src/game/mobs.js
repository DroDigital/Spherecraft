// Mob definitions: sphere-built animals and night creatures.
// Models face +z with the origin at the feet. Parts may be animated:
//   leg: 0..3 (quadruped/biped legs swing in alternating pairs), arm: +-1, head: true.

import { B, PATTERN } from '../blocks.js';
import { I } from '../items.js';

const P = (p, s, color, extra = {}) => ({ p, s, color, pattern: PATTERN.PLAIN, gloss: 0.35, emissive: 0, ...extra });

function quadLegs(color, x, z, y, s, pattern = PATTERN.PLAIN) {
  return [
    P([-x, y, z], s, color, { leg: 0, pivot: y + s[1], pattern }),
    P([x, y, z], s, color, { leg: 1, pivot: y + s[1], pattern }),
    P([-x, y, -z], s, color, { leg: 1, pivot: y + s[1], pattern }),
    P([x, y, -z], s, color, { leg: 0, pivot: y + s[1], pattern }),
  ];
}

function eyes(y, z, x, r = 0.045, color = 0x111111, extra = {}) {
  return [P([-x, y, z], [r, r, r], color, { head: true, gloss: 0.9, ...extra }), P([x, y, z], [r, r, r], color, { head: true, gloss: 0.9, ...extra })];
}

export const MOBS = {
  pig: {
    name: 'Pig', hostile: false, hp: 10, speed: 2.2, hw: 0.4, h: 0.9,
    drops: [[I.RAW_PORK, 1, 3]],
    parts: [
      P([0, 0.62, 0], [0.36, 0.32, 0.52], 0xf0a8a8, { pattern: PATTERN.MOTTLE }),
      P([0, 0.74, 0.54], [0.3, 0.28, 0.28], 0xf0a8a8, { head: true }),
      P([0, 0.68, 0.82], [0.14, 0.1, 0.06], 0xd97f86, { head: true, gloss: 0.6 }),
      ...eyes(0.82, 0.76, 0.13),
      P([0, 0.72, -0.52], [0.06, 0.06, 0.06], 0xf0a8a8),
      ...quadLegs(0xe99a9a, 0.2, 0.3, 0.2, [0.11, 0.2, 0.11]),
    ],
  },
  cow: {
    name: 'Cow', hostile: false, hp: 10, speed: 2.0, hw: 0.45, h: 1.4,
    drops: [[I.RAW_BEEF, 1, 3], [I.LEATHER, 0, 2]],
    parts: [
      P([0, 0.95, 0], [0.42, 0.4, 0.64], 0x5b3b28, { pattern: PATTERN.SPOTS }),
      P([0, 1.18, 0.7], [0.29, 0.3, 0.3], 0x5b3b28, { head: true }),
      P([0, 1.06, 0.95], [0.2, 0.13, 0.08], 0xe8c4b0, { head: true }),
      P([-0.22, 1.42, 0.7], [0.05, 0.08, 0.05], 0xeae3d0, { head: true }),
      P([0.22, 1.42, 0.7], [0.05, 0.08, 0.05], 0xeae3d0, { head: true }),
      ...eyes(1.25, 0.95, 0.15),
      P([0, 0.55, 0.1], [0.14, 0.1, 0.14], 0xf0b8b8),
      ...quadLegs(0x4a2f20, 0.24, 0.4, 0.3, [0.12, 0.3, 0.12]),
    ],
  },
  sheep: {
    name: 'Sheep', hostile: false, hp: 8, speed: 2.1, hw: 0.45, h: 1.3,
    drops: [[B.WOOL_WHITE, 1, 2], [I.RAW_BEEF, 0, 1]],
    parts: [
      P([0, 0.85, 0], [0.48, 0.42, 0.6], 0xf2f2f0, { pattern: PATTERN.WOOL, gloss: 0.1 }),
      P([0, 1.05, 0.62], [0.2, 0.24, 0.24], 0x6e6a66, { head: true }),
      P([0, 1.18, 0.55], [0.22, 0.1, 0.18], 0xf2f2f0, { head: true, pattern: PATTERN.WOOL }),
      ...eyes(1.1, 0.8, 0.11),
      ...quadLegs(0x6e6a66, 0.22, 0.34, 0.25, [0.08, 0.25, 0.08]),
    ],
  },
  chicken: {
    name: 'Chicken', hostile: false, hp: 4, speed: 2.4, hw: 0.25, h: 0.75,
    drops: [[I.RAW_CHICKEN, 1, 1], [I.FEATHER, 0, 2]],
    parts: [
      P([0, 0.42, 0], [0.22, 0.22, 0.28], 0xf7f7f2),
      P([0, 0.52, -0.28], [0.1, 0.12, 0.08], 0xf7f7f2),
      P([-0.21, 0.44, 0], [0.04, 0.14, 0.2], 0xeeeeea),
      P([0.21, 0.44, 0], [0.04, 0.14, 0.2], 0xeeeeea),
      P([0, 0.72, 0.2], [0.13, 0.16, 0.13], 0xf7f7f2, { head: true }),
      P([0, 0.72, 0.36], [0.06, 0.04, 0.07], 0xf2a220, { head: true, gloss: 0.7 }),
      P([0, 0.63, 0.32], [0.035, 0.06, 0.03], 0xd8262a, { head: true }),
      P([0, 0.88, 0.18], [0.03, 0.05, 0.06], 0xd8262a, { head: true }),
      ...eyes(0.77, 0.3, 0.08, 0.025),
      P([-0.08, 0.12, 0], [0.03, 0.12, 0.03], 0xf2b420, { leg: 0, pivot: 0.24 }),
      P([0.08, 0.12, 0], [0.03, 0.12, 0.03], 0xf2b420, { leg: 1, pivot: 0.24 }),
    ],
  },
  shambler: {
    name: 'Shambler', hostile: true, burns: true, hp: 20, speed: 2.6, damage: 3, hw: 0.3, h: 1.9,
    drops: [[I.GRIM_FLESH, 0, 2]],
    parts: [
      P([-0.13, 0.4, 0], [0.14, 0.4, 0.14], 0x34427a, { leg: 0, pivot: 0.8, pattern: PATTERN.WOOL }),
      P([0.13, 0.4, 0], [0.14, 0.4, 0.14], 0x34427a, { leg: 1, pivot: 0.8, pattern: PATTERN.WOOL }),
      P([0, 1.14, 0], [0.28, 0.38, 0.18], 0x2a8a8a, { pattern: PATTERN.MOTTLE }),
      P([0, 1.64, 0], [0.25, 0.26, 0.25], 0x5f9a4a, { head: true, pattern: PATTERN.MOTTLE }),
      ...eyes(1.68, 0.21, 0.09, 0.05, 0x101a10),
      P([-0.38, 1.36, 0.28], [0.1, 0.1, 0.36], 0x5f9a4a, { arm: -1 }),
      P([0.38, 1.36, 0.28], [0.1, 0.1, 0.36], 0x5f9a4a, { arm: 1 }),
    ],
  },
  rattler: {
    name: 'Rattler', hostile: true, burns: true, ranged: true, hp: 20, speed: 2.5, damage: 3, hw: 0.3, h: 1.9,
    drops: [[I.BONE, 0, 2], [I.ARROW, 0, 2]],
    parts: [
      P([-0.12, 0.4, 0], [0.07, 0.4, 0.07], 0xe8e4d8, { leg: 0, pivot: 0.8 }),
      P([0.12, 0.4, 0], [0.07, 0.4, 0.07], 0xe8e4d8, { leg: 1, pivot: 0.8 }),
      P([0, 1.14, 0], [0.2, 0.36, 0.12], 0xe8e4d8, { pattern: PATTERN.RIBS }),
      P([0, 1.64, 0], [0.23, 0.24, 0.23], 0xefebe0, { head: true }),
      ...eyes(1.66, 0.19, 0.09, 0.06, 0x0a0a0a),
      P([-0.3, 1.36, 0.25], [0.055, 0.055, 0.34], 0xe8e4d8, { arm: -1 }),
      P([0.3, 1.36, 0.25], [0.055, 0.055, 0.34], 0xe8e4d8, { arm: 1 }),
      P([0.3, 1.36, 0.6], [0.04, 0.4, 0.04], 0x7a5230, { arm: 1 }),
    ],
  },
  fuse: {
    name: 'Fuse', hostile: true, explodes: true, hp: 20, speed: 2.4, hw: 0.3, h: 1.7,
    drops: [[I.BLAST_POWDER, 0, 2]],
    parts: [
      P([0, 0.9, 0], [0.3, 0.5, 0.3], 0x4fbf3a, { pattern: PATTERN.SPECKLE }),
      P([0, 1.5, 0], [0.3, 0.28, 0.3], 0x4fbf3a, { head: true, pattern: PATTERN.SPECKLE }),
      ...eyes(1.56, 0.26, 0.11, 0.07, 0x0e1a0e),
      P([0, 1.4, 0.27], [0.08, 0.1, 0.05], 0x0e1a0e, { head: true }),
      ...quadLegs(0x3fa12e, 0.14, 0.14, 0.14, [0.12, 0.16, 0.12], PATTERN.SPECKLE),
    ],
  },
  skitter: {
    name: 'Skitter', hostile: true, jumps: true, hp: 16, speed: 3.4, damage: 2, hw: 0.6, h: 0.8,
    drops: [[I.STRING, 0, 2]],
    parts: [
      P([0, 0.52, -0.38], [0.45, 0.36, 0.5], 0x2a2522, { pattern: PATTERN.MOTTLE }),
      P([0, 0.48, 0.3], [0.28, 0.24, 0.26], 0x332b28, { head: true }),
      ...eyes(0.55, 0.53, 0.1, 0.05, 0xff2a1a, { emissive: 2 }),
      ...eyes(0.6, 0.5, 0.18, 0.035, 0xff2a1a, { emissive: 2 }),
      ...[-1, 1].flatMap((sx) => [0.25, 0.08, -0.1, -0.28].map((z, i) =>
        P([sx * 0.55, 0.42, z], [0.46, 0.035, 0.035], 0x221d1a, { spiderLeg: sx, leg: i % 2, pivot: 0.42, rz: sx * 0.35 }))),
    ],
  },
};

export const PASSIVE_TYPES = ['pig', 'cow', 'sheep', 'chicken'];
export const HOSTILE_TYPES = ['shambler', 'shambler', 'rattler', 'fuse', 'skitter'];
