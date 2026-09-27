// Persists settings and player edits in localStorage (best effort; storage may be unavailable).

const SETTINGS_KEY = 'spherecraft.settings.v1';
const SAVE_KEY = 'spherecraft.save.v1';

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(defaults) {
  return { ...defaults, ...(read(SETTINGS_KEY) || {}) };
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}

/** Serialises edits (Map<chunkKey, Map<index, id>>) into a compact JSON-friendly array. */
export function encodeEdits(edits) {
  const out = [];
  for (const [key, m] of edits) {
    const flat = [];
    for (const [i, id] of m) flat.push(i, id);
    if (flat.length) out.push([key, flat]);
  }
  return out;
}

export function decodeEdits(list) {
  const edits = new Map();
  if (!Array.isArray(list)) return edits;
  for (const [key, flat] of list) {
    const m = new Map();
    for (let i = 0; i + 1 < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
    edits.set(Number(key), m);
  }
  return edits;
}

export function loadSave() {
  return read(SAVE_KEY);
}

export function writeSave(save) {
  return write(SAVE_KEY, save);
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
