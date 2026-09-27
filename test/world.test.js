import { describe, it, expect } from 'vitest';
import { Simplex, hash3 } from '../src/world/noise.js';
import { WorldGen } from '../src/world/worldgen.js';
import { World, Chunk } from '../src/world/world.js';
import { CHUNK, HEIGHT, CHUNK_VOLUME, blockIndex, chunkKey, keyToChunk } from '../src/config.js';
import { B } from '../src/blocks.js';
import { encodeEdits, decodeEdits } from '../src/game/storage.js';

describe('noise', () => {
  it('is deterministic per seed and stays in range', () => {
    const a = new Simplex(42);
    const b = new Simplex(42);
    const c = new Simplex(43);
    let differs = false;
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const z = i * -0.19;
      const v = a.noise3(x, z, x - z);
      expect(v).toBe(b.noise3(x, z, x - z));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(a.noise2(x, z))).toBeLessThanOrEqual(1.0001);
      if (c.noise2(x, z) !== a.noise2(x, z)) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('hashes integer coordinates into [0, 1)', () => {
    for (let i = -50; i < 50; i++) {
      const h = hash3(i, i * 3, -i, 7);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
    expect(hash3(1, 2, 3, 4)).toBe(hash3(1, 2, 3, 4));
  });
});

describe('world generation', () => {
  it('produces the same chunk for the same seed', () => {
    const a = new WorldGen(1234).generate(3, -2);
    const b = new WorldGen(1234).generate(3, -2);
    expect(a.length).toBe(CHUNK_VOLUME);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('has bedrock at the bottom and air at the top', () => {
    const blocks = new WorldGen(99).generate(0, 0);
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        expect(blocks[blockIndex(x, 0, z)]).toBe(B.BEDROCK);
        expect(blocks[blockIndex(x, HEIGHT - 1, z)]).toBe(B.AIR);
      }
    }
  });

  it('round-trips chunk keys, including negative coordinates', () => {
    for (const [cx, cz] of [[0, 0], [-1, 5], [123, -456], [-3000, -3000]]) {
      expect(keyToChunk(chunkKey(cx, cz))).toEqual([cx, cz]);
    }
  });
});

describe('world edits', () => {
  it('records edits, reapplies them on reload and survives serialisation', () => {
    const world = new World(5);
    world.loadChunk(0, 0);
    world.loadChunk(-1, 0);
    expect(world.setBlock(3, 70, 4, B.GLOWSTONE)).toBe(true);
    expect(world.setBlock(-2, 71, 4, B.BRICK)).toBe(true);
    expect(world.getBlock(3, 70, 4)).toBe(B.GLOWSTONE);
    // Emitters follow light-emitting blocks.
    expect(world.getChunk(0, 0).emitters).toEqual([3, 70, 4, 14]);

    const restored = new World(5, decodeEdits(JSON.parse(JSON.stringify(encodeEdits(world.edits)))));
    restored.loadChunk(0, 0);
    restored.loadChunk(-1, 0);
    expect(restored.getBlock(3, 70, 4)).toBe(B.GLOWSTONE);
    expect(restored.getBlock(-2, 71, 4)).toBe(B.BRICK);
  });

  it('tracks the sky height of each column', () => {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    blocks[blockIndex(2, 10, 2)] = B.STONE;
    blocks[blockIndex(3, 20, 3)] = B.OAK_LEAVES; // leaves don't block the sky
    const chunk = new Chunk(0, 0, blocks);
    expect(chunk.skyHeight[2 * CHUNK + 2]).toBe(11);
    expect(chunk.skyHeight[3 * CHUNK + 3]).toBe(0);
    expect(chunk.maxY).toBe(20);
  });
});
