// Web worker: generates chunks and builds their sphere meshes off the main thread.

import { WorldGen } from './worldgen.js';
import { Chunk } from './world.js';
import { meshChunk } from './mesher.js';
import { chunkKey } from '../config.js';

let gen = null;

function transferList(data) {
  const out = [];
  for (const k of ['solid', 'deep', 'water']) out.push(data[k].pos.buffer, data[k].aoA.buffer, data[k].aoB.buffer);
  for (const k of ['seal', 'deepSeal', 'waterSeal']) out.push(data[k].position.buffer, data[k].data.buffer);
  return out;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'seed') {
    gen = new WorldGen(m.seed);
  } else if (m.type === 'gen') {
    const blocks = gen.generate(m.cx, m.cz);
    if (m.edits) for (let i = 0; i < m.edits.length; i += 2) blocks[m.edits[i]] = m.edits[i + 1];
    const c = new Chunk(m.cx, m.cz, blocks);
    self.postMessage(
      { type: 'gen', job: m.job, cx: m.cx, cz: m.cz, blocks, skyHeight: c.skyHeight, maxY: c.maxY, emitters: c.emitters, growables: c.growables, springs: gen.springs },
      [blocks.buffer, c.skyHeight.buffer],
    );
  } else if (m.type === 'mesh') {
    const chunks = new Map();
    for (const c of m.chunks) chunks.set(chunkKey(c.cx, c.cz), c);
    const world = { getChunk: (cx, cz) => chunks.get(chunkKey(cx, cz)) };
    const data = meshChunk(world, chunks.get(chunkKey(m.cx, m.cz)));
    self.postMessage({ type: 'mesh', job: m.job, cx: m.cx, cz: m.cz, version: m.version, data }, transferList(data));
  }
};
