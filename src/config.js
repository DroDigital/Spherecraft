// World dimensions and global tuning constants.

export const CHUNK = 16;
export const HEIGHT = 96;
export const SEA_LEVEL = 30;

export const CHUNK_AREA = CHUNK * CHUNK;
export const CHUNK_VOLUME = CHUNK_AREA * HEIGHT;

/** Index of a block inside a chunk's flat block array (x fastest, then z, then y). */
export const blockIndex = (x, y, z) => (y * CHUNK + z) * CHUNK + x;

/** Numeric key for a chunk coordinate pair (valid for |c| < 32768). */
export const chunkKey = (cx, cz) => (cx + 0x8000) * 0x10000 + (cz + 0x8000);
export const keyToChunk = (key) => [Math.floor(key / 0x10000) - 0x8000, (key % 0x10000) - 0x8000];

export const PLAYER = {
  halfWidth: 0.3,
  height: 1.8,
  eye: 1.62,
  reach: 6,
  maxHealth: 20,
};

// A full day/night cycle in seconds (nights run twice as fast as days).
export const DAY_LENGTH = 20 * 60;

// Maximum light radius of emissive blocks, in blocks.
export const MAX_LIGHT_RADIUS = 14;

// Water spheres sit a little lower than solid spheres so lakes read as a surface.
export const WATER_DROP = 0.12;
