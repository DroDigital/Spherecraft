// Items: every placeable block is also an item (same id < 128); ids >= 128 are
// materials, food and tools. Also defines block drops and crafting recipes.

import { B, BLOCKS, PATTERN } from './blocks.js';

export const I = {
  STICK: 128,
  COAL: 129,
  IRON_INGOT: 130,
  GOLD_INGOT: 131,
  DIAMOND: 132,
  RAW_IRON: 133,
  RAW_GOLD: 134,
  APPLE: 135,
  BREAD: 136,
  WHEAT: 137,
  SEEDS: 138,
  RAW_PORK: 139,
  COOKED_PORK: 140,
  RAW_BEEF: 141,
  STEAK: 142,
  RAW_CHICKEN: 143,
  COOKED_CHICKEN: 144,
  FEATHER: 145,
  LEATHER: 146,
  STRING: 147,
  BONE: 148,
  ARROW: 149,
  BLAST_POWDER: 150,
  GRIM_FLESH: 151,
  BUCKET: 152,
  WATER_BUCKET: 153,
  BOW: 154,
  BONE_MEAL: 155,
  FLINT: 156,
  PUMPKIN_PIE: 157,
};

export const TIERS = ['Wooden', 'Stone', 'Iron', 'Diamond'];
export const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
const TIER_COLORS = [0xb08450, 0x8d8d90, 0xe6e6ea, 0x5ee8e0];
const TIER_SPEED = [2, 4, 6, 8];
const TIER_DURABILITY = [60, 132, 250, 1561];
const SWORD_DAMAGE = [4, 5, 6, 7];
export const toolId = (tier, kind) => 160 + tier * 5 + TOOL_KINDS.indexOf(kind);

const items = [];

function item(id, name, props) {
  items[id] = { id, name, stack: 64, color: 0xffffff, color2: null, pattern: PATTERN.PLAIN, gloss: 0.4, shape: 'ball', ...props };
}

item(I.STICK, 'Stick', { color: 0x9a6b3c, shape: 'stick' });
item(I.COAL, 'Coal', { color: 0x252527, color2: 0x111112, pattern: PATTERN.COBBLE, gloss: 0.5, fuel: 8 });
item(I.IRON_INGOT, 'Iron Ingot', { color: 0xdcdce2, color2: 0xa8a8b0, pattern: PATTERN.METAL, gloss: 0.9, shape: 'ingot' });
item(I.GOLD_INGOT, 'Gold Ingot', { color: 0xf7d44a, color2: 0xc9a022, pattern: PATTERN.METAL, gloss: 0.95, shape: 'ingot' });
item(I.DIAMOND, 'Diamond', { color: 0x6ff2ea, color2: 0xd8fffb, pattern: PATTERN.GLASS, gloss: 1, shape: 'gem' });
item(I.RAW_IRON, 'Raw Iron', { color: 0xc99a74, color2: 0x8a6a52, pattern: PATTERN.COBBLE, gloss: 0.4 });
item(I.RAW_GOLD, 'Raw Gold', { color: 0xe8c040, color2: 0xa88a2a, pattern: PATTERN.COBBLE, gloss: 0.6 });
item(I.APPLE, 'Apple', { color: 0xd8262a, color2: 0x8e1418, gloss: 0.8, food: 4 });
item(I.BREAD, 'Bread', { color: 0xc98d45, color2: 0x9a6428, pattern: PATTERN.GRAIN, food: 5, shape: 'loaf' });
item(I.WHEAT, 'Wheat', { color: 0xe0c25a, color2: 0xb8943a, pattern: PATTERN.GRAIN, shape: 'stick' });
item(I.SEEDS, 'Seeds', { color: 0x7db54a, color2: 0x4d8a2a, pattern: PATTERN.SPECKLE, shape: 'small' });
item(I.RAW_PORK, 'Raw Pork', { color: 0xf09a9a, color2: 0xd06a6a, pattern: PATTERN.MOTTLE, food: 3 });
item(I.COOKED_PORK, 'Cooked Pork', { color: 0xc9774a, color2: 0x8a4a28, pattern: PATTERN.MOTTLE, food: 8 });
item(I.RAW_BEEF, 'Raw Beef', { color: 0xd23a3a, color2: 0x9a1f22, pattern: PATTERN.MOTTLE, food: 3 });
item(I.STEAK, 'Steak', { color: 0x8a4a2a, color2: 0x5a2c16, pattern: PATTERN.MOTTLE, food: 8 });
item(I.RAW_CHICKEN, 'Raw Chicken', { color: 0xf3c9b0, color2: 0xd9a58a, pattern: PATTERN.MOTTLE, food: 2 });
item(I.COOKED_CHICKEN, 'Cooked Chicken', { color: 0xd9974f, color2: 0xa86a2a, pattern: PATTERN.MOTTLE, food: 6 });
item(I.FEATHER, 'Feather', { color: 0xf6f6f6, color2: 0xcccccc, shape: 'small' });
item(I.LEATHER, 'Leather', { color: 0x9a5a2e, color2: 0x6a3a1a, pattern: PATTERN.MOTTLE });
item(I.STRING, 'String', { color: 0xeeeeee, shape: 'small' });
item(I.BONE, 'Bone', { color: 0xeee9d8, color2: 0xcfc8b0, shape: 'stick' });
item(I.ARROW, 'Arrow', { color: 0x9a6b3c, shape: 'stick' });
item(I.BLAST_POWDER, 'Blast Powder', { color: 0x555558, color2: 0x2a2a2c, pattern: PATTERN.GRAIN, shape: 'small' });
item(I.GRIM_FLESH, 'Grim Flesh', { color: 0x8a5a3a, color2: 0x4a6a2a, pattern: PATTERN.MOTTLE, food: 3 });
item(I.BUCKET, 'Bucket', { color: 0xc8c8ce, color2: 0x8a8a90, pattern: PATTERN.METAL, gloss: 0.9, stack: 16 });
item(I.WATER_BUCKET, 'Water Bucket', { color: 0x3d7fe6, color2: 0xc8c8ce, pattern: PATTERN.METAL, gloss: 0.95, stack: 1 });
item(I.BOW, 'Bow', { color: 0x8a5a2e, color2: 0xeeeeee, shape: 'stick', stack: 1, durability: 384 });
item(I.BONE_MEAL, 'Bone Meal', { color: 0xf4f1e6, shape: 'small' });
item(I.FLINT, 'Flint', { color: 0x3a3a3e, color2: 0x1a1a1c, pattern: PATTERN.GLASS, gloss: 0.9, shape: 'gem' });
item(I.PUMPKIN_PIE, 'Pumpkin Pie', { color: 0xe0903a, color2: 0xa85a1a, pattern: PATTERN.GRAIN, food: 8, shape: 'loaf' });

for (let tier = 0; tier < 4; tier++) {
  for (const kind of TOOL_KINDS) {
    const id = toolId(tier, kind);
    item(id, `${TIERS[tier]} ${kind[0].toUpperCase()}${kind.slice(1)}`, {
      color: TIER_COLORS[tier],
      color2: 0x7a5230,
      pattern: tier === 0 ? PATTERN.PLANKS : tier === 1 ? PATTERN.COBBLE : tier === 3 ? PATTERN.GLASS : PATTERN.METAL,
      gloss: [0.3, 0.3, 0.9, 1][tier],
      stack: 1,
      shape: 'tool',
      tool: { kind, tier, speed: TIER_SPEED[tier], damage: kind === 'sword' ? SWORD_DAMAGE[tier] : kind === 'axe' ? SWORD_DAMAGE[tier] - 1 : 2 + tier * 0.5 },
      durability: TIER_DURABILITY[tier],
    });
  }
}

// Block items borrow their look from the block registry.
for (const d of BLOCKS) {
  if (!d || !d.inventory) continue;
  items[d.id] = { id: d.id, name: d.name, stack: 64, color: d.color, color2: d.color2, pattern: d.pattern, gloss: d.gloss, shape: 'block', block: d.id };
}

export const ITEMS = items;

export function itemDef(id) {
  return items[id] || null;
}

export function itemName(id) {
  return items[id] ? items[id].name : 'Unknown';
}

/** Every item obtainable in creative mode, blocks first. */
export const CREATIVE_ITEMS = items.filter(Boolean).map((d) => d.id).filter((id) => id !== I.WATER_BUCKET);

export const isFood = (id) => !!items[id]?.food;
export const toolOf = (id) => items[id]?.tool || null;

/** Mining speed multiplier and whether the block drops anything. */
export function miningFor(blockId, itemId) {
  const def = BLOCKS[blockId];
  const tool = toolOf(itemId);
  let speed = 1;
  let tier = 0;
  if (tool && def.tool === tool.kind) {
    speed = tool.speed;
    tier = tool.tier + 1;
  }
  if (tool && tool.kind === 'sword' && (blockId === B.OAK_LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.SPRUCE_LEAVES)) speed = 2;
  const canHarvest = def.tier === 0 || tier >= def.tier;
  if (!canHarvest) speed /= 3.3; // like digging stone with bare hands
  return { speed, canHarvest };
}

/** Items dropped when a block is mined in survival mode. */
export function dropsFor(blockId, rand = Math.random) {
  switch (blockId) {
    case B.GRASS: case B.FARMLAND: return [[B.DIRT, 1]];
    case B.STONE: return [[B.COBBLE, 1]];
    case B.COAL_ORE: return [[I.COAL, 1]];
    case B.IRON_ORE: return [[I.RAW_IRON, 1]];
    case B.GOLD_ORE: return [[I.RAW_GOLD, 1]];
    case B.DIAMOND_ORE: return [[I.DIAMOND, 1]];
    case B.GRAVEL: return rand() < 0.15 ? [[I.FLINT, 1]] : [[B.GRAVEL, 1]];
    case B.GLOWSTONE: return [[B.GLOWSTONE, 1]];
    case B.OAK_LEAVES: case B.BIRCH_LEAVES: case B.SPRUCE_LEAVES: {
      const out = [];
      if (rand() < 0.08) out.push([B.SAPLING, 1]);
      if (blockId === B.OAK_LEAVES && rand() < 0.03) out.push([I.APPLE, 1]);
      if (rand() < 0.03) out.push([I.STICK, 1]);
      return out;
    }
    case B.TALL_GRASS: return rand() < 0.14 ? [[I.SEEDS, 1]] : [];
    case B.WHEAT_0: case B.WHEAT_1: case B.WHEAT_2: return [[I.SEEDS, 1]];
    case B.WHEAT_3: return [[I.WHEAT, 1], [I.SEEDS, 1 + Math.floor(rand() * 3)]];
    case B.GLASS: case B.ICE: case B.BEDROCK: return [];
    case B.SNOW: return [[B.SNOW, 1]];
    case B.CLAY: return [[B.CLAY, 1]];
    default: return BLOCKS[blockId]?.inventory ? [[blockId, 1]] : [];
  }
}

// ---------------------------------------------------------------------------
// Crafting. Shapeless recipes; `station` is null (inventory), 'table' or 'furnace'.
// ---------------------------------------------------------------------------

const R = [];
function recipe(out, count, inputs, station = null) {
  R.push({ out, count, inputs, station });
}

for (const log of [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG]) recipe(B.PLANKS, 4, [[log, 1]]);
recipe(I.STICK, 4, [[B.PLANKS, 2]]);
recipe(B.CRAFTING_TABLE, 1, [[B.PLANKS, 4]]);
recipe(B.TORCH, 4, [[I.COAL, 1], [I.STICK, 1]]);
recipe(B.FURNACE, 1, [[B.COBBLE, 8]], 'table');
recipe(B.CHEST, 1, [[B.PLANKS, 8]], 'table');
recipe(B.BED, 1, [[B.WOOL_WHITE, 3], [B.PLANKS, 3]], 'table');
const TOOL_MATERIAL = [B.PLANKS, B.COBBLE, I.IRON_INGOT, I.DIAMOND];
const TOOL_COST = { pickaxe: [3, 2], axe: [3, 2], shovel: [1, 2], sword: [2, 1], hoe: [2, 2] };
for (let tier = 0; tier < 4; tier++) {
  for (const kind of TOOL_KINDS) {
    const [m, s] = TOOL_COST[kind];
    recipe(toolId(tier, kind), 1, [[TOOL_MATERIAL[tier], m], [I.STICK, s]], 'table');
  }
}
recipe(I.BREAD, 1, [[I.WHEAT, 3]], 'table');
recipe(I.PUMPKIN_PIE, 1, [[B.PUMPKIN, 1], [I.WHEAT, 1]], 'table');
recipe(I.BUCKET, 1, [[I.IRON_INGOT, 3]], 'table');
recipe(I.BOW, 1, [[I.STICK, 3], [I.STRING, 3]], 'table');
recipe(I.ARROW, 4, [[I.FLINT, 1], [I.STICK, 1], [I.FEATHER, 1]], 'table');
recipe(I.BONE_MEAL, 3, [[I.BONE, 1]]);
recipe(B.WOOL_WHITE, 1, [[I.STRING, 4]]);
recipe(B.WOOL_RED, 1, [[B.WOOL_WHITE, 1], [B.FLOWER_RED, 1]]);
recipe(B.WOOL_YELLOW, 1, [[B.WOOL_WHITE, 1], [B.FLOWER_YELLOW, 1]]);
recipe(B.SANDSTONE, 1, [[B.SAND, 4]]);
recipe(B.KEG, 1, [[I.BLAST_POWDER, 5], [B.SAND, 4]], 'table');
recipe(B.GLOWSTONE, 1, [[B.TORCH, 4], [B.GLASS, 1]], 'table');
// Furnace (each smelt burns one unit of fuel).
recipe(B.GLASS, 1, [[B.SAND, 1]], 'furnace');
recipe(B.STONE, 1, [[B.COBBLE, 1]], 'furnace');
recipe(B.BRICK, 1, [[B.CLAY, 1]], 'furnace');
recipe(I.IRON_INGOT, 1, [[I.RAW_IRON, 1]], 'furnace');
recipe(I.GOLD_INGOT, 1, [[I.RAW_GOLD, 1]], 'furnace');
recipe(I.COOKED_PORK, 1, [[I.RAW_PORK, 1]], 'furnace');
recipe(I.STEAK, 1, [[I.RAW_BEEF, 1]], 'furnace');
recipe(I.COOKED_CHICKEN, 1, [[I.RAW_CHICKEN, 1]], 'furnace');
recipe(I.COAL, 1, [[B.OAK_LOG, 1]], 'furnace');

export const RECIPES = R;

/** Fuel value (smelts) of an item, or 0. */
export function fuelValue(id) {
  if (id === I.COAL) return 8;
  if (id === B.PLANKS || id === I.STICK) return 1;
  if (id === B.OAK_LOG || id === B.BIRCH_LOG || id === B.SPRUCE_LOG) return 2;
  return 0;
}
