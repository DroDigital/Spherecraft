import { describe, it, expect } from 'vitest';
import { World, Chunk } from '../src/world/world.js';
import { Fluids } from '../src/world/fluids.js';
import { Inventory, clickSlot } from '../src/game/inventory.js';
import { CHUNK, CHUNK_VOLUME, blockIndex, chunkKey } from '../src/config.js';
import { B, FLUID } from '../src/blocks.js';
import { I, RECIPES, dropsFor, miningFor, toolId, itemDef } from '../src/items.js';

function flatWorld(ground = 4) {
  const world = new World(1);
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) {
      const blocks = new Uint8Array(CHUNK_VOLUME);
      for (let y = 0; y <= ground; y++) {
        for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) blocks[blockIndex(x, y, z)] = B.STONE;
      }
      world.chunks.set(chunkKey(cx, cz), new Chunk(cx, cz, blocks));
    }
  }
  return world;
}

function settle(fluids, steps = 80) {
  for (let i = 0; i < steps; i++) fluids.update(fluids.interval);
}

describe('water simulation', () => {
  it('spreads from a source, losing a level per block', () => {
    const world = flatWorld();
    const fluids = new Fluids(world);
    world.onBlockChanged = (x, y, z) => fluids.scheduleAround(x, y, z);
    world.setBlock(0, 5, 0, B.WATER);
    settle(fluids);
    expect(FLUID[world.getBlock(1, 5, 0)]).toBe(7);
    expect(FLUID[world.getBlock(3, 5, 0)]).toBe(5);
    expect(FLUID[world.getBlock(7, 5, 0)]).toBe(1);
    expect(world.getBlock(8, 5, 0)).toBe(B.AIR);
  });

  it('falls down ledges and dries up when the source is removed', () => {
    const world = flatWorld();
    const fluids = new Fluids(world);
    world.onBlockChanged = (x, y, z) => fluids.scheduleAround(x, y, z);
    for (let y = 5; y < 9; y++) world.setBlock(0, y, 0, B.STONE);
    world.setBlock(0, 9, 0, B.WATER);
    settle(fluids);
    expect(world.getBlock(1, 8, 0)).toBe(B.WATER_FALL); // poured off the pillar
    expect(FLUID[world.getBlock(1, 5, 0)]).toBeGreaterThan(0);
    world.setBlock(0, 9, 0, B.AIR);
    settle(fluids, 200);
    expect(FLUID[world.getBlock(1, 5, 0)]).toBe(0);
    expect(FLUID[world.getBlock(3, 5, 0)]).toBe(0);
  });

  it('turns water between two sources into a new source', () => {
    const world = flatWorld();
    const fluids = new Fluids(world);
    world.onBlockChanged = (x, y, z) => fluids.scheduleAround(x, y, z);
    world.setBlock(0, 5, 0, B.WATER);
    world.setBlock(2, 5, 0, B.WATER);
    settle(fluids);
    expect(world.getBlock(1, 5, 0)).toBe(B.WATER);
  });
});

describe('inventory', () => {
  it('stacks, overflows and removes items', () => {
    const inv = new Inventory();
    expect(inv.add(B.DIRT, 100)).toBe(0);
    expect(inv.get(0)).toEqual({ id: B.DIRT, count: 64 });
    expect(inv.get(1)).toEqual({ id: B.DIRT, count: 36 });
    expect(inv.remove(B.DIRT, 70)).toBe(70);
    expect(inv.count(B.DIRT)).toBe(30);
    const pick = toolId(0, 'pickaxe');
    inv.add(pick, 2);
    expect(inv.slots.filter((s) => s && s.id === pick).length).toBe(2); // tools don't stack
    expect(inv.slots.find((s) => s && s.id === pick).dur).toBe(itemDef(pick).durability);
  });

  it('moves stacks with the cursor like an inventory screen', () => {
    const inv = new Inventory();
    inv.set(0, { id: B.SAND, count: 10 });
    let cursor = clickSlot(inv, 0, null, true); // right click splits
    expect(cursor.count).toBe(5);
    expect(inv.get(0).count).toBe(5);
    cursor = clickSlot(inv, 3, cursor, true); // right click drops one
    expect(inv.get(3).count).toBe(1);
    expect(cursor.count).toBe(4);
    cursor = clickSlot(inv, 0, cursor, false); // merge back
    expect(cursor).toBeNull();
    expect(inv.get(0).count).toBe(9);
    expect(Inventory.fromJSON(JSON.parse(JSON.stringify(inv.toJSON()))).count(B.SAND)).toBe(10);
  });
});

describe('items and mining', () => {
  it('needs the right tool tier to harvest ores', () => {
    expect(miningFor(B.IRON_ORE, 0).canHarvest).toBe(false);
    expect(miningFor(B.IRON_ORE, toolId(0, 'pickaxe')).canHarvest).toBe(false);
    expect(miningFor(B.IRON_ORE, toolId(1, 'pickaxe')).canHarvest).toBe(true);
    expect(miningFor(B.STONE, toolId(2, 'pickaxe')).speed).toBeGreaterThan(miningFor(B.STONE, toolId(0, 'pickaxe')).speed);
    expect(miningFor(B.DIRT, 0).canHarvest).toBe(true);
  });

  it('drops the mined material', () => {
    expect(dropsFor(B.STONE)).toEqual([[B.COBBLE, 1]]);
    expect(dropsFor(B.GRASS)).toEqual([[B.DIRT, 1]]);
    expect(dropsFor(B.COAL_ORE)).toEqual([[I.COAL, 1]]);
    expect(dropsFor(B.OAK_LOG)).toEqual([[B.OAK_LOG, 1]]);
    expect(dropsFor(B.GLASS)).toEqual([]);
  });

  it('has recipes whose ingredients and outputs all exist', () => {
    for (const r of RECIPES) {
      expect(itemDef(r.out), `recipe output ${r.out}`).toBeTruthy();
      for (const [id] of r.inputs) expect(itemDef(id), `ingredient ${id}`).toBeTruthy();
    }
  });
});
