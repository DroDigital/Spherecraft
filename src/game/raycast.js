// Voxel ray traversal (Amanatides & Woo).

/**
 * Walks the voxel grid from (ox, oy, oz) along a normalised direction and returns the
 * first block for which `hitTest(id)` is true, together with the face normal of the
 * face that was entered, or null within `maxDist`.
 */
export function raycast(getBlock, ox, oy, oz, dx, dy, dz, maxDist, hitTest) {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx > 0 ? (x + 1 - ox) * tDeltaX : dx < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = dy > 0 ? (y + 1 - oy) * tDeltaY : dy < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz > 0 ? (z + 1 - oz) * tDeltaZ : dz < 0 ? (oz - z) * tDeltaZ : Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;
  while (t <= maxDist) {
    const id = getBlock(x, y, z);
    if (hitTest(id)) return { x, y, z, nx, ny, nz, id, t };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}
