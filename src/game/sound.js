// Tiny procedural sound effects with Web Audio (no audio files).

let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Must be called from a user gesture once (browsers block audio before that). */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setVolume(v) {
  ensure();
  if (master) master.gain.value = v;
}

function env(node, t, a, d, peak) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq, dur, type = 'sine', peak = 0.4, slide = 1) {
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, 0.005, dur, peak);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, freq, q = 1, peak = 0.5, type = 'bandpass') {
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.004, dur, peak);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const sfx = {
  pop: () => { tone(420 + Math.random() * 120, 0.09, 'sine', 0.35, 0.5); noise(0.06, 1800, 2, 0.15); },
  dig: () => noise(0.08, 500 + Math.random() * 400, 1.2, 0.2),
  place: () => { tone(180, 0.08, 'triangle', 0.3, 0.7); noise(0.05, 900, 1, 0.12); },
  step: () => noise(0.05, 300 + Math.random() * 200, 1, 0.06),
  hurt: () => { tone(330, 0.18, 'square', 0.18, 0.6); },
  mobHurt: () => tone(520, 0.12, 'sawtooth', 0.12, 0.7),
  pickup: () => { tone(880 + Math.random() * 200, 0.06, 'sine', 0.2, 1.4); },
  eat: () => noise(0.08, 1200, 3, 0.2),
  burp: () => tone(140, 0.25, 'sawtooth', 0.15, 0.6),
  splash: () => noise(0.35, 700, 0.6, 0.35, 'lowpass'),
  boom: () => { noise(0.9, 180, 0.4, 0.9, 'lowpass'); tone(70, 0.6, 'sine', 0.6, 0.4); },
  hiss: () => noise(1.3, 4000, 0.5, 0.2, 'highpass'),
  bow: () => { tone(260, 0.15, 'triangle', 0.25, 1.8); noise(0.1, 2500, 2, 0.1); },
  craft: () => { tone(660, 0.07, 'sine', 0.2); setTimeout(() => tone(990, 0.08, 'sine', 0.2), 60); },
  click: () => tone(1200, 0.03, 'square', 0.08),
  breakTool: () => { noise(0.2, 3000, 3, 0.3); tone(900, 0.2, 'square', 0.1, 0.3); },
};
