// Slot-based inventory: 9 hotbar slots followed by 27 storage slots.
// A stack is { id, count, dur? } where dur is the remaining tool durability.

import { itemDef } from '../items.js';

export const HOTBAR = 9;
export const SLOTS = 36;

export function maxStack(id) {
  return itemDef(id)?.stack ?? 64;
}

export function newStack(id, count = 1) {
  const def = itemDef(id);
  const s = { id, count };
  if (def?.durability) s.dur = def.durability;
  return s;
}

export class Inventory {
  constructor(size = SLOTS) {
    this.slots = new Array(size).fill(null);
    this.version = 0;
  }

  get(i) {
    return this.slots[i];
  }

  set(i, stack) {
    this.slots[i] = stack && stack.count > 0 ? stack : null;
    this.version++;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** Adds items; returns how many could not fit. Hotbar slots are filled first. */
  add(id, count = 1, dur) {
    const max = maxStack(id);
    let left = count;
    if (max > 1) {
      for (const s of this.slots) {
        if (left <= 0) break;
        if (s && s.id === id && s.count < max) {
          const n = Math.min(max - s.count, left);
          s.count += n;
          left -= n;
        }
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(max, left);
      const s = newStack(id, n);
      if (dur !== undefined) s.dur = dur;
      this.slots[i] = s;
      left -= n;
    }
    this.version++;
    return left;
  }

  /** Removes up to `count` items of an id; returns how many were removed. */
  remove(id, count = 1) {
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const n = Math.min(s.count, left);
      s.count -= n;
      left -= n;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.version++;
    return count - left;
  }

  /** Removes `count` from one slot. */
  take(i, count = 1) {
    const s = this.slots[i];
    if (!s) return null;
    const n = Math.min(count, s.count);
    s.count -= n;
    if (s.count <= 0) this.slots[i] = null;
    this.version++;
    return { ...s, count: n };
  }

  hasRoomFor(id) {
    const max = maxStack(id);
    return this.slots.some((s) => !s || (s.id === id && s.count < max));
  }

  clear() {
    this.slots.fill(null);
    this.version++;
  }

  toJSON() {
    return this.slots.map((s) => (s ? [s.id, s.count, s.dur ?? -1] : 0));
  }

  static fromJSON(list, size = SLOTS) {
    const inv = new Inventory(size);
    if (Array.isArray(list)) {
      list.slice(0, size).forEach((e, i) => {
        if (!Array.isArray(e) || !itemDef(e[0])) return;
        const s = { id: e[0], count: e[1] };
        if (e[2] >= 0) s.dur = e[2];
        inv.slots[i] = s;
      });
    }
    return inv;
  }
}

/**
 * Cursor-stack click handling for inventory screens (like a real inventory UI):
 * left click picks up / drops / swaps the whole stack, right click splits or places one.
 */
export function clickSlot(inv, i, cursor, right) {
  const s = inv.slots[i];
  if (!cursor) {
    if (!s) return null;
    if (right && s.count > 1) {
      const half = Math.ceil(s.count / 2);
      s.count -= half;
      inv.version++;
      return { ...s, count: half };
    }
    inv.set(i, null);
    return s;
  }
  if (!s) {
    if (right) {
      inv.set(i, { ...cursor, count: 1 });
      cursor.count -= 1;
      return cursor.count > 0 ? cursor : null;
    }
    inv.set(i, cursor);
    return null;
  }
  if (s.id === cursor.id && s.dur === undefined) {
    const room = maxStack(s.id) - s.count;
    const n = Math.min(room, right ? 1 : cursor.count);
    s.count += n;
    cursor.count -= n;
    inv.version++;
    return cursor.count > 0 ? cursor : null;
  }
  inv.set(i, cursor);
  return s;
}
