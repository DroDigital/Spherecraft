// Block registry. Every block is rendered as one or more spheres/ellipsoids.

// Surface patterns understood by the sphere fragment shader.
export const PATTERN = {
  PLAIN: 0,
  SPECKLE: 1,
  BARK: 2,
  MOTTLE: 3,
  GRAIN: 4,
  BIRCH: 5,
  BRICK: 6,
  PLANKS: 7,
  LEAVES: 8,
  GLOW: 9,
  GRASS: 10,
  RIBS: 11,
  WOOL: 12,
  SNOW: 13,
  WATER: 14,
  GLASS: 15,
  CRAFT: 16,
  FURNACE: 17,
  CHEST: 18,
  FARMLAND: 19,
  KEG: 20,
  ORE: 21,
  ICE: 22,
  COBBLE: 23,
  SPOTS: 24, // animal hides
  METAL: 25,
};

// Non-spherical shapes (index into the shape table uploaded to the shader).
// offset is relative to the block centre, scale is the ellipsoid radii.
// jitter randomises the horizontal position, vary randomises the height.
export const SHAPES = [
  null, // 0: plain sphere using the block radius
  { offset: [-0.17, -0.22, -0.06], scale: [0.1, 0.3, 0.1], jitter: 0.12, vary: 0.5 }, // 1 grass blade
  { offset: [0.16, -0.25, 0.13], scale: [0.09, 0.26, 0.09], jitter: 0.12, vary: 0.5 }, // 2 grass blade
  { offset: [0.04, -0.2, -0.2], scale: [0.1, 0.32, 0.1], jitter: 0.12, vary: 0.5 }, // 3 grass blade
  { offset: [0, -0.3, 0], scale: [0.045, 0.22, 0.045], jitter: 0.16, vary: 0.25 }, // 4 flower stem
  { offset: [0, -0.04, 0], scale: [0.16, 0.13, 0.16], jitter: 0.16, vary: 0.0 }, // 5 flower head
  { offset: [0, -0.22, 0], scale: [0.065, 0.3, 0.065], jitter: 0, vary: 0 }, // 6 torch stick
  { offset: [0, 0.16, 0], scale: [0.11, 0.14, 0.11], jitter: 0, vary: 0 }, // 7 torch flame
  { offset: [0, 0, 0], scale: [0.43, 0.5, 0.43], jitter: 0, vary: 0 }, // 8 cactus
  { offset: [-0.2, -0.08, -0.12], scale: [0.07, 0.42, 0.07], jitter: 0.06, vary: 0.2 }, // 9 tall stalk
  { offset: [0.18, -0.1, 0.1], scale: [0.07, 0.4, 0.07], jitter: 0.06, vary: 0.2 }, // 10 tall stalk
  { offset: [0.0, -0.06, -0.22], scale: [0.07, 0.44, 0.07], jitter: 0.06, vary: 0.2 }, // 11 tall stalk
  { offset: [0.0, 0.32, 0.0], scale: [0.2, 0.14, 0.2], jitter: 0.06, vary: 0.1 }, // 12 grain head
  { offset: [0, 0.02, 0], scale: [0.26, 0.24, 0.26], jitter: 0.04, vary: 0.2 }, // 13 sapling crown
  { offset: [0, -0.2, 0], scale: [0.5, 0.3, 0.5], jitter: 0, vary: 0 }, // 14 bed mattress
  { offset: [0, 0.07, -0.26], scale: [0.3, 0.12, 0.18], jitter: 0, vary: 0 }, // 15 bed pillow
];

const defs = [];

function def(id, name, props) {
  defs[id] = {
    id,
    name,
    color: 0xff00ff,
    color2: null,
    pattern: PATTERN.PLAIN,
    gloss: 0.35,
    emissive: 0,
    radius: 0.5,
    alpha: 1, // < 1: rendered in the translucent pass
    bump: 0.3, // procedural bump strength
    solid: true, // collides with the player
    opaque: true, // hides neighbours / generates crevice sealing
    fluid: 0, // 0 none, else water level 1..8 (8 = source / falling)
    parts: null, // [[shape, typeId], ...] for non-sphere blocks
    light: 0, // emitted light radius (blocks)
    hardness: 0.5, // seconds to break by hand with the right tool
    tool: null, // 'pickaxe' | 'axe' | 'shovel' | 'hoe' | null
    tier: 0, // minimum tool tier to get drops (0 = hand)
    inventory: true,
    ...props,
  };
}

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  OAK_LOG: 6,
  OAK_LEAVES: 7,
  PLANKS: 8,
  COBBLE: 9,
  SNOW: 10,
  COAL_ORE: 11,
  IRON_ORE: 12,
  GOLD_ORE: 13,
  DIAMOND_ORE: 14,
  BIRCH_LOG: 15,
  BIRCH_LEAVES: 16,
  SPRUCE_LOG: 17,
  SPRUCE_LEAVES: 18,
  TORCH: 19,
  TALL_GRASS: 20,
  FLOWER_RED: 21,
  FLOWER_YELLOW: 22,
  SANDSTONE: 23,
  CACTUS: 24,
  GRAVEL: 25,
  BRICK: 26,
  GLOWSTONE: 27,
  BEDROCK: 28,
  WOOL_WHITE: 29,
  WOOL_RED: 30,
  WOOL_ORANGE: 31,
  WOOL_YELLOW: 32,
  WOOL_LIME: 33,
  WOOL_CYAN: 34,
  WOOL_BLUE: 35,
  WOOL_PURPLE: 36,
  WOOL_PINK: 37,
  WOOL_BLACK: 38,
  CLAY: 39,
  ICE: 40,
  // Flowing water, level 1 (thin) .. 7, and falling water (48).
  WATER_1: 41,
  WATER_7: 47,
  WATER_FALL: 48,
  CRAFTING_TABLE: 49,
  FURNACE: 50,
  BED: 51,
  FARMLAND: 52,
  WHEAT_0: 53,
  WHEAT_1: 54,
  WHEAT_2: 55,
  WHEAT_3: 56,
  SAPLING: 57,
  GLASS: 58,
  PUMPKIN: 59,
  CHEST: 60,
  KEG: 61,
  // Render-only helper types (never stored in the world).
  STEM: 120,
  TORCH_STICK: 121,
  PILLOW: 122,
};

const WOOL = { pattern: PATTERN.WOOL, gloss: 0.12, hardness: 0.35, bump: 0.35 };

def(B.AIR, 'Air', { solid: false, opaque: false, inventory: false, hardness: 0 });
def(B.GRASS, 'Grass', { color: 0x62c436, color2: 0x4fa82b, pattern: PATTERN.GRASS, gloss: 0.35, hardness: 0.45, radius: 0.51, tool: 'shovel', bump: 0.25 });
def(B.DIRT, 'Dirt', { color: 0x8d5a34, color2: 0x6a4127, pattern: PATTERN.MOTTLE, gloss: 0.2, hardness: 0.4, tool: 'shovel', bump: 0.45 });
def(B.STONE, 'Stone', { color: 0x9b9b9d, color2: 0x7c7c80, pattern: PATTERN.MOTTLE, gloss: 0.3, hardness: 1.5, tool: 'pickaxe', tier: 1, bump: 0.5 });
def(B.SAND, 'Sand', { color: 0xecdcaa, color2: 0xd4bf88, pattern: PATTERN.GRAIN, gloss: 0.3, hardness: 0.4, tool: 'shovel', bump: 0.3 });
def(B.WATER, 'Water', {
  color: 0x7cc0ff, color2: 0x3f86e0, pattern: PATTERN.WATER, gloss: 1, alpha: 0.26, bump: 0,
  solid: false, opaque: false, fluid: 8, hardness: Infinity, inventory: false,
});
for (let l = 1; l <= 7; l++) {
  def(B.WATER_1 + l - 1, `Flowing Water ${l}`, {
    color: 0x7cc0ff, color2: 0x3f86e0, pattern: PATTERN.WATER, gloss: 1, alpha: 0.3, bump: 0,
    radius: 0.2 + 0.3 * (l / 8), solid: false, opaque: false, fluid: l, hardness: Infinity, inventory: false,
  });
}
def(B.WATER_FALL, 'Falling Water', {
  color: 0x8ccaff, color2: 0xe0f2ff, pattern: PATTERN.WATER, gloss: 1, alpha: 0.42, bump: 0, radius: 0.46,
  solid: false, opaque: false, fluid: 8, hardness: Infinity, inventory: false,
});
def(B.OAK_LOG, 'Oak Log', { color: 0x7b5431, color2: 0x4f331c, pattern: PATTERN.BARK, gloss: 0.25, hardness: 2, tool: 'axe', bump: 0.8 });
def(B.OAK_LEAVES, 'Oak Leaves', { color: 0x46a02e, color2: 0x2f7a20, pattern: PATTERN.LEAVES, gloss: 0.4, hardness: 0.3, radius: 0.53, bump: 0.5 });
def(B.PLANKS, 'Planks', { color: 0xbd8d52, color2: 0x8c6333, pattern: PATTERN.PLANKS, gloss: 0.35, hardness: 1.5, tool: 'axe', bump: 0.5 });
def(B.COBBLE, 'Cobblestone', { color: 0x8a8a8c, color2: 0x55555a, pattern: PATTERN.COBBLE, gloss: 0.25, hardness: 1.8, tool: 'pickaxe', tier: 1, bump: 0.9 });
def(B.SNOW, 'Snow', { color: 0xf3f7ff, color2: 0xd0dcf2, pattern: PATTERN.SNOW, gloss: 0.5, hardness: 0.3, tool: 'shovel', bump: 0.2 });
def(B.COAL_ORE, 'Coal Ore', { color: 0x9b9b9d, color2: 0x1c1c1e, pattern: PATTERN.ORE, gloss: 0.3, hardness: 2.2, tool: 'pickaxe', tier: 1, bump: 0.6 });
def(B.IRON_ORE, 'Iron Ore', { color: 0x9b9b9d, color2: 0xd9a57c, pattern: PATTERN.ORE, gloss: 0.4, hardness: 2.6, tool: 'pickaxe', tier: 2, bump: 0.6 });
def(B.GOLD_ORE, 'Gold Ore', { color: 0x9b9b9d, color2: 0xf6d33c, pattern: PATTERN.ORE, gloss: 0.6, hardness: 2.6, tool: 'pickaxe', tier: 3, bump: 0.6 });
def(B.DIAMOND_ORE, 'Diamond Ore', { color: 0x9b9b9d, color2: 0x5cf0e4, pattern: PATTERN.ORE, gloss: 0.7, hardness: 3, tool: 'pickaxe', tier: 3, bump: 0.6 });
def(B.BIRCH_LOG, 'Birch Log', { color: 0xe4ddce, color2: 0x2e2b26, pattern: PATTERN.BIRCH, gloss: 0.3, hardness: 2, tool: 'axe', bump: 0.4 });
def(B.BIRCH_LEAVES, 'Birch Leaves', { color: 0x7dbb4a, color2: 0x5a9632, pattern: PATTERN.LEAVES, gloss: 0.4, hardness: 0.3, radius: 0.53, bump: 0.5 });
def(B.SPRUCE_LOG, 'Spruce Log', { color: 0x53392a, color2: 0x2e1f15, pattern: PATTERN.BARK, gloss: 0.25, hardness: 2, tool: 'axe', bump: 0.8 });
def(B.SPRUCE_LEAVES, 'Spruce Leaves', { color: 0x2f6b3c, color2: 0x1d4a28, pattern: PATTERN.LEAVES, gloss: 0.35, hardness: 0.3, radius: 0.53, bump: 0.5 });
def(B.TORCH, 'Torch', {
  color: 0xffc34a, color2: 0xff7a1a, pattern: PATTERN.GLOW, emissive: 2.2, gloss: 0.2,
  solid: false, opaque: false, light: 12, hardness: 0.05, bump: 0,
  parts: [[6, B.TORCH_STICK], [7, B.TORCH]],
});
def(B.TALL_GRASS, 'Tall Grass', {
  color: 0x6fd03d, color2: 0x4fa82b, pattern: PATTERN.GRASS, gloss: 0.4, bump: 0,
  solid: false, opaque: false, hardness: 0.02, parts: [[1, B.TALL_GRASS], [2, B.TALL_GRASS], [3, B.TALL_GRASS]],
});
def(B.FLOWER_RED, 'Red Flower', {
  color: 0xe8343a, color2: 0xa81d2a, gloss: 0.5, solid: false, opaque: false, hardness: 0.02, bump: 0,
  parts: [[4, B.STEM], [5, B.FLOWER_RED]],
});
def(B.FLOWER_YELLOW, 'Yellow Flower', {
  color: 0xffd52e, color2: 0xe0a91a, gloss: 0.5, solid: false, opaque: false, hardness: 0.02, bump: 0,
  parts: [[4, B.STEM], [5, B.FLOWER_YELLOW]],
});
def(B.SANDSTONE, 'Sandstone', { color: 0xdcc58c, color2: 0xbf9f62, pattern: PATTERN.GRAIN, gloss: 0.25, hardness: 1.2, tool: 'pickaxe', tier: 1, bump: 0.4 });
def(B.CACTUS, 'Cactus', {
  color: 0x3f9a3a, color2: 0x2b6e28, pattern: PATTERN.RIBS, gloss: 0.4, opaque: false, hardness: 0.6, bump: 0.6,
  parts: [[8, B.CACTUS]],
});
def(B.GRAVEL, 'Gravel', { color: 0x8f8683, color2: 0x5a5350, pattern: PATTERN.COBBLE, gloss: 0.25, hardness: 0.6, tool: 'shovel', bump: 0.8 });
def(B.BRICK, 'Bricks', { color: 0xa9503c, color2: 0xd9cdbf, pattern: PATTERN.BRICK, gloss: 0.3, hardness: 2, tool: 'pickaxe', tier: 1, bump: 0.7 });
def(B.GLOWSTONE, 'Glowstone', { color: 0xffd98a, color2: 0xe09b3a, pattern: PATTERN.GLOW, emissive: 1.6, gloss: 0.5, light: 14, hardness: 0.3, bump: 0.3 });
def(B.BEDROCK, 'Bedrock', { color: 0x4a4a4c, color2: 0x1e1e20, pattern: PATTERN.COBBLE, gloss: 0.2, hardness: Infinity, inventory: false, bump: 1 });
def(B.WOOL_WHITE, 'White Wool', { color: 0xf2f2f2, color2: 0xd4d4d4, ...WOOL });
def(B.WOOL_RED, 'Red Wool', { color: 0xc8322e, color2: 0x9e2522, ...WOOL });
def(B.WOOL_ORANGE, 'Orange Wool', { color: 0xf08a24, color2: 0xc86d15, ...WOOL });
def(B.WOOL_YELLOW, 'Yellow Wool', { color: 0xf6d03a, color2: 0xd1ad22, ...WOOL });
def(B.WOOL_LIME, 'Lime Wool', { color: 0x78c83a, color2: 0x5ba52a, ...WOOL });
def(B.WOOL_CYAN, 'Cyan Wool', { color: 0x1f9aa6, color2: 0x167882, ...WOOL });
def(B.WOOL_BLUE, 'Blue Wool', { color: 0x3a4bc0, color2: 0x2c3a98, ...WOOL });
def(B.WOOL_PURPLE, 'Purple Wool', { color: 0x8a3ec0, color2: 0x6c2e98, ...WOOL });
def(B.WOOL_PINK, 'Pink Wool', { color: 0xf09ab8, color2: 0xd07898, ...WOOL });
def(B.WOOL_BLACK, 'Black Wool', { color: 0x252529, color2: 0x151518, ...WOOL });
def(B.CLAY, 'Clay', { color: 0xa3a9b8, color2: 0x8a90a0, pattern: PATTERN.MOTTLE, gloss: 0.55, hardness: 0.5, tool: 'shovel', bump: 0.15 });
def(B.ICE, 'Ice', { color: 0xa9d2fb, color2: 0xe8f4ff, pattern: PATTERN.ICE, gloss: 1, alpha: 0.72, opaque: false, hardness: 0.5, tool: 'pickaxe', bump: 0.1 });
def(B.CRAFTING_TABLE, 'Crafting Table', { color: 0xa87a45, color2: 0x5b3b1f, pattern: PATTERN.CRAFT, gloss: 0.3, hardness: 2, tool: 'axe', bump: 0.6 });
def(B.FURNACE, 'Furnace', { color: 0x8a8a8c, color2: 0x2a2020, pattern: PATTERN.FURNACE, gloss: 0.3, hardness: 3, tool: 'pickaxe', tier: 1, bump: 0.7 });
def(B.BED, 'Bed', {
  color: 0xc8322e, color2: 0x8e1f1c, pattern: PATTERN.WOOL, gloss: 0.15, opaque: false, hardness: 0.3, bump: 0.3,
  parts: [[14, B.BED], [15, B.PILLOW]],
});
def(B.FARMLAND, 'Farmland', { color: 0x5e3b20, color2: 0x3c2413, pattern: PATTERN.FARMLAND, gloss: 0.3, hardness: 0.4, tool: 'shovel', bump: 0.7, inventory: false });
const WHEAT_COLORS = [[0x7ccf45, 0x5aa332], [0x8fcf45, 0x6aa332], [0xb4c24a, 0x8c9a33], [0xe0c25a, 0xb8943a]];
for (let s = 0; s < 4; s++) {
  def(B.WHEAT_0 + s, `Wheat (stage ${s + 1})`, {
    color: WHEAT_COLORS[s][0], color2: WHEAT_COLORS[s][1], pattern: PATTERN.GRASS, gloss: 0.35, bump: 0,
    solid: false, opaque: false, hardness: 0.02, inventory: false,
    parts: s < 2 ? [[1, B.WHEAT_0 + s], [2, B.WHEAT_0 + s], [3, B.WHEAT_0 + s]]
      : s === 2 ? [[9, B.WHEAT_2], [10, B.WHEAT_2], [11, B.WHEAT_2]]
        : [[9, B.WHEAT_3], [10, B.WHEAT_3], [11, B.WHEAT_3], [12, B.WHEAT_3]],
  });
}
def(B.SAPLING, 'Sapling', {
  color: 0x4fb03a, color2: 0x357d22, pattern: PATTERN.LEAVES, gloss: 0.4, bump: 0.3,
  solid: false, opaque: false, hardness: 0.02, parts: [[4, B.STEM], [13, B.SAPLING]],
});
def(B.GLASS, 'Glass', { color: 0xdff4ff, color2: 0xffffff, pattern: PATTERN.GLASS, gloss: 1, alpha: 0.28, opaque: false, hardness: 0.4, bump: 0 });
def(B.PUMPKIN, 'Pumpkin', { color: 0xe88a1f, color2: 0xb35f10, pattern: PATTERN.RIBS, gloss: 0.45, hardness: 1, tool: 'axe', bump: 0.5 });
def(B.CHEST, 'Chest', { color: 0xa9793f, color2: 0x4a3016, pattern: PATTERN.CHEST, gloss: 0.35, hardness: 2, tool: 'axe', bump: 0.5 });
def(B.KEG, 'Powder Keg', { color: 0xc23b2a, color2: 0x2a2320, pattern: PATTERN.KEG, gloss: 0.35, hardness: 0.1, bump: 0.3 });
def(B.STEM, 'Stem', { color: 0x3f8f2a, inventory: false, solid: false, opaque: false, bump: 0 });
def(B.TORCH_STICK, 'Torch Stick', { color: 0x6b4a2a, color2: 0x4a321c, pattern: PATTERN.BARK, inventory: false, solid: false, opaque: false, bump: 0.3 });
def(B.PILLOW, 'Pillow', { color: 0xf4f4f4, color2: 0xdadada, pattern: PATTERN.WOOL, gloss: 0.1, inventory: false, solid: false, opaque: false, bump: 0.2 });

export const BLOCKS = defs;
export const MAX_BLOCK_ID = 128;

// Fast lookup tables for hot loops.
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const LIGHT = new Uint8Array(256);
export const HAS_PARTS = new Uint8Array(256);
export const SKY_BLOCKING = new Uint8Array(256); // blocks that cast "roof" darkness (not leaves or water)
export const REPLACEABLE = new Uint8Array(256); // can be overwritten by placing a block
export const FLUID = new Uint8Array(256); // water level (0 = not water)
export const TRANSLUCENT = new Uint8Array(256); // drawn in the translucent pass

for (const d of defs) {
  if (!d) continue;
  SOLID[d.id] = d.solid ? 1 : 0;
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  LIGHT[d.id] = d.light;
  HAS_PARTS[d.id] = d.parts ? 1 : 0;
  SKY_BLOCKING[d.id] = d.opaque && !String(d.name).includes('Leaves') ? 1 : 0;
  FLUID[d.id] = d.fluid;
  TRANSLUCENT[d.id] = d.alpha < 1 ? 1 : 0;
  if (d.fluid) REPLACEABLE[d.id] = 1;
}
REPLACEABLE[B.AIR] = 1;
REPLACEABLE[B.TALL_GRASS] = 1;

export const isWater = (id) => FLUID[id] > 0;

/** Blocks that need a solid block underneath them. */
export const NEEDS_SUPPORT = new Set([
  B.TALL_GRASS, B.FLOWER_RED, B.FLOWER_YELLOW, B.CACTUS, B.SAPLING, B.TORCH,
  B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.WHEAT_3,
]);

/** Blocks that react to right-click instead of placing against them. */
export const INTERACTIVE = new Set([B.CRAFTING_TABLE, B.FURNACE, B.BED, B.CHEST, B.KEG]);

/** Blocks that are "ticked" to grow. */
export const GROWS = new Set([B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.SAPLING]);

export function blockName(id) {
  return defs[id] ? defs[id].name : 'Unknown';
}
