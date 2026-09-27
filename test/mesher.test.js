import { describe, it, expect } from 'vitest';
import { World, Chunk } from '../src/world/world.js';
import { meshChunk } from '../src/world/mesher.js';
import { CHUNK, CHUNK_VOLUME, blockIndex, chunkKey } from '../src/config.js';
import { B } from '../src/blocks.js';

/** A world whose 3x3 chunks around the origin are filled by `fill(x, y, z)` (world coords). */
function syntheticWorld(fill) {
  const world = new World(1);
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) {
      const blocks = new Uint8Array(CHUNK_VOLUME);
      for (let y = 0; y < 16; y++) {
        for (let z = 0; z < CHUNK; z++) {
          for (let x = 0; x < CHUNK; x++) blocks[blockIndex(x, y, z)] = fill(cx * CHUNK + x, y, cz * CHUNK + z);
        }
      }
      world.chunks.set(chunkKey(cx, cz), new Chunk(cx, cz, blocks));
    }
  }
  return world;
}

function quads(seal) {
  const out = [];
  for (let q = 0; q < seal.count / 6; q++) {
    const p = seal.position.subarray(q * 18, q * 18 + 18);
    const xs = [p[0], p[3], p[6], p[9], p[12], p[15]];
    const ys = [p[1], p[4], p[7], p[10], p[13], p[16]];
    const zs = [p[2], p[5], p[8], p[11], p[14], p[17]];
    out.push({
      min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
      max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
    });
  }
  return out;
}

describe('mesher', () => {
  it('renders only the exposed layer of a flat slab and seals it with one flat surface', () => {
    const world = syntheticWorld((x, y) => (y <= 4 ? B.STONE : B.AIR));
    const data = meshChunk(world, world.getChunk(0, 0));
    expect(data.solid.count).toBe(CHUNK * CHUNK);
    for (let i = 0; i < data.solid.count; i++) expect(data.solid.pos[i * 4 + 1]).toBe(4);
    expect(data.deep.count).toBe(0);

    const qs = quads(data.seal);
    expect(qs.length).toBe(CHUNK * CHUNK);
    let area = 0;
    for (const q of qs) {
      expect(q.min[1]).toBeCloseTo(4.5);
      expect(q.max[1]).toBeCloseTo(4.5);
      area += (q.max[0] - q.min[0]) * (q.max[2] - q.min[2]);
    }
    // The sealer tiles the whole chunk with no gaps.
    expect(area).toBeCloseTo(CHUNK * CHUNK);
  });

  it('gives exposed tops no occlusion and buried sides full contact shading', () => {
    const world = syntheticWorld((x, y) => (y <= 4 ? B.DIRT : B.AIR));
    const data = meshChunk(world, world.getChunk(0, 0));
    const i = 0;
    const yp = data.solid.aoA[i * 4 + 2];
    const yn = data.solid.aoA[i * 4 + 3];
    const xp = data.solid.aoA[i * 4];
    expect(yp).toBe(0);
    expect(yn).toBe(255);
    expect(xp).toBeGreaterThan(150);
    // Fully lit by the sky.
    expect(data.solid.aoB[i * 4 + 2] >> 4).toBe(15);
  });

  it('draws a lone floating block as one sphere without degenerate sealer quads', () => {
    const world = syntheticWorld((x, y, z) => (x === 5 && y === 8 && z === 5 ? B.BRICK : B.AIR));
    const data = meshChunk(world, world.getChunk(0, 0));
    expect(data.solid.count).toBe(1);
    expect(data.seal.count).toBe(0);
  });

  it('meets at the centre line on convex edges and fills concave corners', () => {
    // A single step: y<=4 everywhere, plus y=5 where x >= 8.
    const world = syntheticWorld((x, y) => (y <= 4 || (y === 5 && x >= 8) ? B.STONE : B.AIR));
    const data = meshChunk(world, world.getChunk(0, 0));
    const qs = quads(data.seal);
    // Lower floor quad next to the step extends to the centre of the buried block (x = 8.5).
    const lower = qs.filter((q) => Math.abs(q.min[1] - 4.5) < 1e-6 && Math.abs(q.max[1] - 4.5) < 1e-6);
    expect(Math.max(...lower.map((q) => q.max[0]))).toBeCloseTo(8.5);
    // Riser quad of the step sits in the plane x = 8.5 and reaches down to y = 4.5.
    const riser = qs.filter((q) => Math.abs(q.min[0] - 8.5) < 1e-6 && Math.abs(q.max[0] - 8.5) < 1e-6);
    expect(riser.length).toBe(CHUNK);
    for (const q of riser) {
      expect(q.min[1]).toBeCloseTo(4.5);
      expect(q.max[1]).toBeCloseTo(5.5);
    }
  });

  it('only renders the surface of water and marks falling columns', () => {
    const world = syntheticWorld((x, y, z) => {
      if (y <= 2) return B.SAND;
      if (y <= 6) return B.WATER;
      if (x === 3 && z === 3 && y <= 10) return B.WATER; // a column of water above the pool
      return B.AIR;
    });
    const data = meshChunk(world, world.getChunk(0, 0));
    const ys = new Set();
    let falling = 0;
    for (let i = 0; i < data.water.count; i++) {
      ys.add(data.water.pos[i * 4 + 1]);
      if (data.water.aoB[i * 4 + 3] === 1) falling++;
    }
    expect([...ys].every((y) => y >= 6)).toBe(true);
    expect(falling).toBe(3); // y = 7, 8, 9 have water above and open sides
    // Sand under water is still meshed (for swimming) but the water surface seals it from above.
    expect(data.solid.count).toBe(CHUNK * CHUNK);
  });
});
