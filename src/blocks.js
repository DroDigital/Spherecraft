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
  { offset: [0, -0.28, 0], scale: [0.2, 0.2, 0.2], jitter: 0.18, vary: 0.4 }, // 9 mushroom/pebble cap
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
    solid: true, // collides with the player
    opaque: true, // hides neighbours / generates crevice sealing
    liquid: false,
    parts: null, // [[shape, typeId], ...] for non-sphere blocks
    light: 0, // emitted light radius (blocks)
    hardness: 0.5, // seconds to break
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
  // Render-only helper types (never stored in the world).
  STEM: 60,
  TORCH_STICK: 61,
};

def(B.AIR, 'Air', { solid: false, opaque: false, inventory: false, hardness: 0 });
def(B.GRASS, 'Grass', { color: 0x62c436, color2: 0x4fa82b, pattern: PATTERN.GRASS, gloss: 0.4, hardness: 0.35, radius: 0.51 });
def(B.DIRT, 'Dirt', { color: 0x8d5a34, color2: 0x70452a, pattern: PATTERN.MOTTLE, gloss: 0.3, hardness: 0.3 });
def(B.STONE, 'Stone', { color: 0x9b9b9d, color2: 0x828285, pattern: PATTERN.MOTTLE, gloss: 0.3, hardness: 0.75 });
def(B.SAND, 'Sand', { color: 0xecdcaa, color2: 0xd9c690, pattern: PATTERN.GRAIN, gloss: 0.25, hardness: 0.3 });
def(B.WATER, 'Water', { color: 0x2c63e0, color2: 0x1a45b0, gloss: 0.95, solid: false, opaque: false, liquid: true, hardness: 0 });
def(B.OAK_LOG, 'Oak Log', { color: 0x7b5431, color2: 0x5a3b21, pattern: PATTERN.BARK, gloss: 0.3, hardness: 0.6 });
def(B.OAK_LEAVES, 'Oak Leaves', { color: 0x46a02e, color2: 0x357d22, pattern: PATTERN.LEAVES, gloss: 0.45, hardness: 0.12, radius: 0.53 });
def(B.PLANKS, 'Planks', { color: 0xbd8d52, color2: 0x9b703d, pattern: PATTERN.PLANKS, gloss: 0.35, hardness: 0.5 });
def(B.COBBLE, 'Cobblestone', { color: 0x828284, color2: 0x5c5c60, pattern: PATTERN.SPECKLE, gloss: 0.25, hardness: 0.8 });
def(B.SNOW, 'Snow', { color: 0xf3f7ff, color2: 0xd6e2f5, pattern: PATTERN.SNOW, gloss: 0.5, hardness: 0.2 });
def(B.COAL_ORE, 'Coal Ore', { color: 0x9b9b9d, color2: 0x242426, pattern: PATTERN.SPECKLE, gloss: 0.3, hardness: 0.9 });
def(B.IRON_ORE, 'Iron Ore', { color: 0x9b9b9d, color2: 0xd9a57c, pattern: PATTERN.SPECKLE, gloss: 0.35, hardness: 1.0 });
def(B.GOLD_ORE, 'Gold Ore', { color: 0x9b9b9d, color2: 0xf6d33c, pattern: PATTERN.SPECKLE, gloss: 0.5, hardness: 1.0 });
def(B.DIAMOND_ORE, 'Diamond Ore', { color: 0x9b9b9d, color2: 0x5cf0e4, pattern: PATTERN.SPECKLE, gloss: 0.6, hardness: 1.2 });
def(B.BIRCH_LOG, 'Birch Log', { color: 0xe4ddce, color2: 0x33302a, pattern: PATTERN.BIRCH, gloss: 0.3, hardness: 0.6 });
def(B.BIRCH_LEAVES, 'Birch Leaves', { color: 0x7dbb4a, color2: 0x5f9a35, pattern: PATTERN.LEAVES, gloss: 0.45, hardness: 0.12, radius: 0.53 });
def(B.SPRUCE_LOG, 'Spruce Log', { color: 0x53392a, color2: 0x3a2619, pattern: PATTERN.BARK, gloss: 0.3, hardness: 0.6 });
def(B.SPRUCE_LEAVES, 'Spruce Leaves', { color: 0x2f6b3c, color2: 0x21502c, pattern: PATTERN.LEAVES, gloss: 0.4, hardness: 0.12, radius: 0.53 });
def(B.TORCH, 'Torch', {
  color: 0xffc34a, color2: 0xff7a1a, pattern: PATTERN.GLOW, emissive: 2.2, gloss: 0.2,
  solid: false, opaque: false, light: 12, hardness: 0.05,
  parts: [[6, B.TORCH_STICK], [7, B.TORCH]],
});
def(B.TALL_GRASS, 'Tall Grass', {
  color: 0x6fd03d, color2: 0x4fa82b, pattern: PATTERN.GRASS, gloss: 0.4,
  solid: false, opaque: false, hardness: 0.02, parts: [[1, B.TALL_GRASS], [2, B.TALL_GRASS], [3, B.TALL_GRASS]],
});
def(B.FLOWER_RED, 'Red Flower', {
  color: 0xe8343a, color2: 0xa81d2a, gloss: 0.5, solid: false, opaque: false, hardness: 0.02,
  parts: [[4, B.STEM], [5, B.FLOWER_RED]],
});
def(B.FLOWER_YELLOW, 'Yellow Flower', {
  color: 0xffd52e, color2: 0xe0a91a, gloss: 0.5, solid: false, opaque: false, hardness: 0.02,
  parts: [[4, B.STEM], [5, B.FLOWER_YELLOW]],
});
def(B.SANDSTONE, 'Sandstone', { color: 0xdcc58c, color2: 0xc4a96e, pattern: PATTERN.GRAIN, gloss: 0.25, hardness: 0.7 });
def(B.CACTUS, 'Cactus', {
  color: 0x3f9a3a, color2: 0x2b6e28, pattern: PATTERN.RIBS, gloss: 0.4, opaque: false, hardness: 0.3,
  parts: [[8, B.CACTUS]],
});
def(B.GRAVEL, 'Gravel', { color: 0x8f8683, color2: 0x625b58, pattern: PATTERN.SPECKLE, gloss: 0.25, hardness: 0.35 });
def(B.BRICK, 'Bricks', { color: 0xa9503c, color2: 0xd9cdbf, pattern: PATTERN.BRICK, gloss: 0.3, hardness: 0.9 });
def(B.GLOWSTONE, 'Glowstone', { color: 0xffd98a, color2: 0xe09b3a, pattern: PATTERN.GLOW, emissive: 1.6, gloss: 0.5, light: 14, hardness: 0.3 });
def(B.BEDROCK, 'Bedrock', { color: 0x4a4a4c, color2: 0x1e1e20, pattern: PATTERN.SPECKLE, gloss: 0.2, hardness: Infinity, inventory: false });
def(B.WOOL_WHITE, 'White Wool', { color: 0xf2f2f2, color2: 0xd8d8d8, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_RED, 'Red Wool', { color: 0xc8322e, color2: 0x9e2522, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_ORANGE, 'Orange Wool', { color: 0xf08a24, color2: 0xc86d15, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_YELLOW, 'Yellow Wool', { color: 0xf6d03a, color2: 0xd1ad22, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_LIME, 'Lime Wool', { color: 0x78c83a, color2: 0x5ba52a, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_CYAN, 'Cyan Wool', { color: 0x1f9aa6, color2: 0x167882, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_BLUE, 'Blue Wool', { color: 0x3a4bc0, color2: 0x2c3a98, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_PURPLE, 'Purple Wool', { color: 0x8a3ec0, color2: 0x6c2e98, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_PINK, 'Pink Wool', { color: 0xf09ab8, color2: 0xd07898, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.WOOL_BLACK, 'Black Wool', { color: 0x252529, color2: 0x151518, pattern: PATTERN.WOOL, gloss: 0.15, hardness: 0.25 });
def(B.CLAY, 'Clay', { color: 0xa3a9b8, color2: 0x8e94a3, pattern: PATTERN.PLAIN, gloss: 0.55, hardness: 0.35 });
def(B.ICE, 'Ice', { color: 0x9cc6f8, color2: 0x7aa8e8, pattern: PATTERN.PLAIN, gloss: 1.0, hardness: 0.3 });
def(B.STEM, 'Stem', { color: 0x3f8f2a, inventory: false, solid: false, opaque: false });
def(B.TORCH_STICK, 'Torch Stick', { color: 0x6b4a2a, color2: 0x4a321c, pattern: PATTERN.BARK, inventory: false, solid: false, opaque: false });

export const BLOCKS = defs;
export const MAX_BLOCK_ID = 64;

// Fast lookup tables for hot loops.
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const LIGHT = new Uint8Array(256);
export const HAS_PARTS = new Uint8Array(256);
export const SKY_BLOCKING = new Uint8Array(256); // blocks that cast "roof" darkness (not leaves)
export const REPLACEABLE = new Uint8Array(256); // can be overwritten by placing a block

for (const d of defs) {
  if (!d) continue;
  SOLID[d.id] = d.solid ? 1 : 0;
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  LIGHT[d.id] = d.light;
  HAS_PARTS[d.id] = d.parts ? 1 : 0;
  SKY_BLOCKING[d.id] = (d.opaque && !String(d.name).includes('Leaves')) || d.liquid ? 1 : 0;
}
REPLACEABLE[B.AIR] = 1;
REPLACEABLE[B.WATER] = 1;
REPLACEABLE[B.TALL_GRASS] = 1;

/** Blocks that need a solid block underneath them. */
export const NEEDS_SUPPORT = new Set([B.TALL_GRASS, B.FLOWER_RED, B.FLOWER_YELLOW, B.CACTUS]);

/** Ordered list shown in the inventory screen. */
export const INVENTORY_BLOCKS = defs.filter((d) => d && d.inventory).map((d) => d.id);

export const DEFAULT_HOTBAR = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.OAK_LOG, B.GLOWSTONE, B.TORCH, B.WOOL_RED,
];

export function blockName(id) {
  return defs[id] ? defs[id].name : 'Unknown';
}
