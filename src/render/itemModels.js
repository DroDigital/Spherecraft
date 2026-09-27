// Ellipsoid models for items (used in hand, on the ground and in icons).
// Each part: { p: [x, y, z], s: [sx, sy, sz], color, type, pattern, gloss, emissive }
// in item space (about one unit tall).

import { itemDef } from '../items.js';
import { BLOCKS, PATTERN } from '../blocks.js';

const cache = new Map();

function part(p, s, def, extra = {}) {
  return {
    p, s,
    color: def.color,
    type: -1,
    pattern: def.pattern ?? PATTERN.PLAIN,
    gloss: def.gloss ?? 0.4,
    emissive: 0,
    ...extra,
  };
}

export function itemModel(id) {
  if (cache.has(id)) return cache.get(id);
  const def = itemDef(id);
  let parts = [];
  if (!def) parts = [];
  else if (def.block !== undefined) {
    const b = BLOCKS[def.block];
    if (b.parts && b.parts.length > 1) {
      // Plants, torches: a small representative bundle.
      const stem = BLOCKS[b.parts[0][1]];
      const top = BLOCKS[b.parts[b.parts.length - 1][1]];
      parts = [
        part([0, -0.05, 0], [0.07, 0.32, 0.07], stem, { type: stem.id }),
        part([0, 0.28, 0], [0.18, 0.18, 0.18], top, { type: top.id, emissive: top.emissive }),
      ];
    } else {
      parts = [part([0, 0, 0], [0.5, 0.5, 0.5], b, { type: def.block, emissive: b.emissive })];
    }
  } else {
    const handle = { color: 0x7a5230, pattern: PATTERN.PLANKS, gloss: 0.3 };
    switch (def.shape) {
      case 'stick': parts = [part([0, 0, 0], [0.07, 0.45, 0.07], def)]; break;
      case 'small': parts = [part([0, 0, 0], [0.18, 0.18, 0.18], def)]; break;
      case 'ingot': parts = [part([0, 0, 0], [0.38, 0.16, 0.22], def)]; break;
      case 'gem': parts = [part([0, 0, 0], [0.24, 0.32, 0.24], def)]; break;
      case 'loaf': parts = [part([0, 0, 0], [0.42, 0.24, 0.26], def)]; break;
      case 'tool': {
        const kind = def.tool.kind;
        parts = [part([0, -0.1, 0], [0.055, 0.5, 0.055], handle)];
        if (kind === 'pickaxe') parts.push(part([0, 0.36, 0], [0.44, 0.09, 0.1], def));
        else if (kind === 'axe') parts.push(part([0.14, 0.28, 0], [0.2, 0.2, 0.07], def));
        else if (kind === 'shovel') parts.push(part([0, 0.46, 0], [0.14, 0.2, 0.05], def));
        else if (kind === 'hoe') parts.push(part([0.12, 0.36, 0], [0.22, 0.07, 0.07], def));
        else if (kind === 'sword') {
          parts = [
            part([0, -0.34, 0], [0.05, 0.16, 0.05], handle),
            part([0, -0.17, 0], [0.2, 0.05, 0.07], def),
            part([0, 0.25, 0], [0.08, 0.45, 0.03], def),
          ];
        }
        break;
      }
      default: parts = [part([0, 0, 0], [0.33, 0.33, 0.33], def)];
    }
    if (def.id === 154) parts = [part([0, 0, 0], [0.06, 0.5, 0.06], def), part([0.12, 0, 0], [0.015, 0.45, 0.015], { color: 0xeeeeee })];
    if (def.id === 153) parts.push(part([0, 0.12, 0], [0.26, 0.08, 0.26], { color: 0x3d7fe6, gloss: 1, pattern: PATTERN.WATER }));
  }
  cache.set(id, parts);
  return parts;
}
