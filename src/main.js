import './style.css';
import * as THREE from 'three';
import { CHUNK, HEIGHT, SEA_LEVEL, DAY_LENGTH, PLAYER } from './config.js';
import { B, BLOCKS, SOLID, REPLACEABLE, NEEDS_SUPPORT, INVENTORY_BLOCKS, DEFAULT_HOTBAR } from './blocks.js';
import { World } from './world/world.js';
import { hashString } from './world/noise.js';
import { Graphics } from './render/graphics.js';
import { Player } from './game/player.js';
import { Input, IS_TOUCH } from './game/input.js';
import { Streamer } from './game/streamer.js';
import { raycast } from './game/raycast.js';
import * as storage from './game/storage.js';
import { UI } from './ui/ui.js';

const DEFAULT_SETTINGS = {
  renderDistance: IS_TOUCH ? 5 : 8,
  fov: 75,
  sensitivity: 1,
  resolution: 1.5,
  shadows: !IS_TOUCH,
  dayCycle: true,
  autoJump: IS_TOUCH,
  debug: false,
};

const RANDOM_SEEDS = ['sphere', 'marble', 'bubble', 'orbit', 'pebble', 'gumball', 'boba', 'planet', 'dewdrop', 'bead'];

function randomSeed() {
  const word = RANDOM_SEEDS[Math.floor(Math.random() * RANDOM_SEEDS.length)];
  return `${word}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function seedNumber(text) {
  const t = String(text).trim();
  return /^-?\d+$/.test(t) ? Number(t) >>> 0 : hashString(t);
}

const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();

class Game {
  constructor() {
    this.settings = storage.loadSettings(DEFAULT_SETTINGS);
    this.canvas = document.getElementById('game');
    this.gfx = new Graphics(this.canvas);
    this.input = new Input(this.canvas, document.getElementById('touch'));
    this.ui = new UI();
    if (IS_TOUCH) document.body.classList.add('touch');

    this.state = 'loading';
    this.time = 0;
    this.dayTime = 0.1;
    this.lastFrame = performance.now();
    this.fps = 60;
    this.hotbar = DEFAULT_HOTBAR.slice();
    this.selected = 0;
    this.breaking = null; // { x, y, z, progress }
    this.lastPlace = -1;
    this.lastSave = 0;
    this.titleAngle = 0;
    this.fovBoost = 0;
    this.returnScreen = 'title';
    this.perf = { time: 0, frames: 0, scale: 1 };

    this._bindUI();
    this._bindInput();
    this.applySettings();

    const save = storage.loadSave();
    this.startWorld(save?.seed ?? randomSeed(), save);

    window.addEventListener('resize', () => this.gfx.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveGame();
    });
    window.addEventListener('pagehide', () => this.saveGame());
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- world

  startWorld(seedText, save) {
    this.seedText = String(seedText);
    const edits = save && save.seed === this.seedText ? storage.decodeEdits(save.edits) : new Map();
    if (this.streamer) this.streamer.reset();
    this.world = new World(seedNumber(this.seedText), edits);
    this.streamer = new Streamer(this.world, this.gfx.chunks);
    this.streamer.setRadius(this.settings.renderDistance);
    this.player = new Player(this.world);
    this.player.autoJump = this.settings.autoJump;
    this.player.onDamage = () => this.ui.flashDamage();
    this.spawn = this.findSpawnColumn();
    this.titleHeight = 0;

    const sameWorld = save && save.seed === this.seedText;
    if (sameWorld && save.player) {
      const p = save.player;
      this.player.setPosition(p.x, p.y, p.z);
      this.player.yaw = p.yaw || 0;
      this.player.pitch = p.pitch || 0;
      this.player.flying = !!p.flying;
      this.player.health = p.health > 0 ? p.health : PLAYER.maxHealth;
      this.needsSpawn = false;
    } else {
      this.player.setPosition(this.spawn.x + 0.5, this.spawn.y + 1, this.spawn.z + 0.5);
      this.player.yaw = Math.PI * 0.75;
      this.needsSpawn = true;
    }
    this.dayTime = sameWorld && typeof save.dayTime === 'number' ? save.dayTime : 0.1;
    if (sameWorld && Array.isArray(save.hotbar) && save.hotbar.length === 9) {
      this.hotbar = save.hotbar.map((id) => (INVENTORY_BLOCKS.includes(id) ? id : B.AIR));
      this.selected = Math.min(8, Math.max(0, save.selected | 0));
    } else {
      this.hotbar = DEFAULT_HOTBAR.slice();
      this.selected = 0;
    }
    this.ui.buildHotbar(this.hotbar, (i) => this.selectSlot(i));
    this.ui.selectSlot(this.selected);
    this.ui.setHealth(this.player.health);
    document.getElementById('seed-input').value = this.seedText;
  }

  /** Picks a dry, fairly low land column near the origin using the height function only. */
  findSpawnColumn() {
    const gen = this.world.gen;
    for (let r = 0; r < 400; r += 4) {
      const steps = Math.max(1, Math.round((r * Math.PI * 2) / 8));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r);
        const z = Math.round(Math.sin(a) * r);
        const h = gen.heightAt(x, z);
        if (h >= SEA_LEVEL + 2 && h <= SEA_LEVEL + 16) return { x, y: h, z };
      }
    }
    return { x: 0, y: gen.heightAt(0, 0), z: 0 };
  }

  /** Once chunks exist, nudge the spawn onto a free, solid spot (not inside a tree). */
  settleSpawn() {
    const w = this.world;
    const s = this.spawn;
    for (let r = 0; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = s.x + dx;
          const z = s.z + dz;
          const h = w.gen.heightAt(x, z);
          const ground = w.getBlock(x, h, z);
          if (!SOLID[ground] || ground === B.OAK_LEAVES || ground === B.SPRUCE_LEAVES || ground === B.BIRCH_LEAVES) continue;
          if (SOLID[w.getBlock(x, h + 1, z)] || SOLID[w.getBlock(x, h + 2, z)]) continue;
          this.spawn = { x, y: h, z };
          return;
        }
      }
    }
  }

  respawnPoint() {
    const { x, z } = this.spawn;
    // Climb out of anything the player may have built over the spawn point.
    let y = this.spawn.y + 1;
    while (y < HEIGHT - 2 && (SOLID[this.world.getBlock(x, y, z)] || SOLID[this.world.getBlock(x, y + 1, z)])) y++;
    return { x: x + 0.5, y, z: z + 0.5 };
  }

  saveGame() {
    if (!this.world || this.state === 'loading') return;
    const p = this.player;
    storage.writeSave({
      version: 1,
      seed: this.seedText,
      edits: storage.encodeEdits(this.world.edits),
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying, health: p.health },
      dayTime: this.dayTime,
      hotbar: this.hotbar,
      selected: this.selected,
    });
    this.lastSave = this.time;
  }

  // ---------------------------------------------------------------- settings / UI

  applySettings() {
    const s = this.settings;
    this.gfx.setRenderDistance(s.renderDistance);
    this.gfx.setShadows(s.shadows, IS_TOUCH ? 1024 : 2048);
    this.gfx.setPixelRatioCap(s.resolution);
    if (this.perf && this.perf.scale !== 1) {
      this.perf.scale = 1;
      this.gfx.setResolutionScale(1);
    }
    this.input.sensitivity = s.sensitivity;
    if (this.streamer) this.streamer.setRadius(s.renderDistance);
    if (this.player) this.player.autoJump = s.autoJump;
    this.ui.toggleDebug(s.debug);
    storage.saveSettings(s);
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $('btn-play').addEventListener('click', () => {
      const seed = $('seed-input').value.trim() || randomSeed();
      if (seed !== this.seedText) this.newWorld(seed);
      this.play();
    });
    $('seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('btn-play').click();
    });
    $('btn-random').addEventListener('click', () => {
      $('seed-input').value = randomSeed();
      $('btn-play').click();
    });
    $('btn-resume').addEventListener('click', () => this.play());
    $('btn-title').addEventListener('click', () => {
      this.saveGame();
      this.toTitle();
    });
    const openSettings = (from) => {
      this.returnScreen = from;
      this.syncSettingsForm();
      this.ui.show('settings');
    };
    $('btn-settings').addEventListener('click', () => openSettings('pause'));
    $('btn-title-settings').addEventListener('click', () => openSettings('title'));
    $('btn-settings-done').addEventListener('click', () => this.ui.show(this.returnScreen));
    const openHelp = (from) => {
      this.returnScreen = from;
      this.ui.show('help');
    };
    $('btn-help').addEventListener('click', () => openHelp('pause'));
    $('btn-title-help').addEventListener('click', () => openHelp('title'));
    $('btn-help-done').addEventListener('click', () => this.ui.show(this.returnScreen));
    $('btn-inv-done').addEventListener('click', () => this.closeInventory());
    $('btn-respawn').addEventListener('click', () => this.respawn());
    $('touch-pause').addEventListener('click', () => this.pause());
    $('touch-inv').addEventListener('click', () => this.openInventory());

    this.ui.buildInventory((id) => {
      this.hotbar[this.selected] = id;
      this.ui.updateHotbar(this.hotbar);
      this.ui.selectSlot(this.selected, id);
    });

    const bindRange = (id, out, key, fmt, apply = true) => {
      const input = $(id);
      input.addEventListener('input', () => {
        this.settings[key] = Number(input.value);
        $(out).textContent = fmt(this.settings[key]);
        if (apply) this.applySettings();
      });
    };
    bindRange('set-distance', 'out-distance', 'renderDistance', (v) => `${v} chunks`);
    bindRange('set-fov', 'out-fov', 'fov', (v) => `${v}°`);
    bindRange('set-sens', 'out-sens', 'sensitivity', (v) => `${v.toFixed(1)}×`);
    bindRange('set-res', 'out-res', 'resolution', (v) => `${Math.round(v * 100)}%`);
    const bindCheck = (id, key) => {
      $(id).addEventListener('change', (e) => {
        this.settings[key] = e.target.checked;
        this.applySettings();
      });
    };
    bindCheck('set-shadows', 'shadows');
    bindCheck('set-daycycle', 'dayCycle');
    bindCheck('set-autojump', 'autoJump');
    bindCheck('set-fps', 'debug');
  }

  syncSettingsForm() {
    const $ = (id) => document.getElementById(id);
    const s = this.settings;
    $('set-distance').value = s.renderDistance;
    $('out-distance').textContent = `${s.renderDistance} chunks`;
    $('set-fov').value = s.fov;
    $('out-fov').textContent = `${s.fov}°`;
    $('set-sens').value = s.sensitivity;
    $('out-sens').textContent = `${Number(s.sensitivity).toFixed(1)}×`;
    $('set-res').value = s.resolution;
    $('out-res').textContent = `${Math.round(s.resolution * 100)}%`;
    $('set-shadows').checked = s.shadows;
    $('set-daycycle').checked = s.dayCycle;
    $('set-autojump').checked = s.autoJump;
    $('set-fps').checked = s.debug;
  }

  _bindInput() {
    const input = this.input;
    input.onKey = (code, e, first) => {
      if (!first) return;
      if (this.state === 'playing') {
        if (code.startsWith('Digit')) {
          const n = Number(code.slice(5));
          if (n >= 1 && n <= 9) this.selectSlot(n - 1);
        } else if (code === 'KeyE') {
          this.openInventory();
        } else if (code === 'F3') {
          this.settings.debug = !this.settings.debug;
          this.applySettings();
        } else if (code === 'Escape' && (input.dragMode || input.touch)) {
          this.pause();
        } else if (code === 'KeyF') {
          this.player.toggleFly();
        }
      } else if (this.state === 'inventory') {
        if (code === 'KeyE' || code === 'Escape') this.closeInventory();
        else if (code.startsWith('Digit')) {
          const n = Number(code.slice(5));
          if (n >= 1 && n <= 9) this.selectSlot(n - 1);
        }
      }
    };
    input.onDoubleJump = () => {
      if (this.state === 'playing') this.player.toggleFly();
    };
    input.onLockChange = (locked, failure) => {
      if (failure === 'unsupported') {
        // Pointer lock unavailable (e.g. inside an embedded frame): keep playing with drag-to-look.
        if (this.state === 'playing') this.ui.toast('Drag to look around');
        return;
      }
      if (failure === 'retry') {
        if (this.state === 'playing') this.ui.toast('Click to resume');
        return;
      }
      if (!locked && this.state === 'playing' && !input.dragMode) this.pause();
    };
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.input.touch && !this.input.dragMode) this.input.requestLock();
    });
  }

  // ---------------------------------------------------------------- state changes

  setState(state) {
    this.state = state;
    const playing = state === 'playing';
    this.input.enabled = playing;
    document.body.classList.toggle('playing', playing);
    document.body.classList.toggle('inventory', state === 'inventory');
    this.ui.setHud(playing || state === 'inventory');
    if (!playing) {
      this.input.breakHeld = false;
      this.input.placeHeld = false;
      this.breaking = null;
      this.gfx.uniforms.uBreak.value = 0;
    }
  }

  finishLoading() {
    this.settleSpawn();
    if (this.needsSpawn) {
      const s = this.respawnPoint();
      this.player.setPosition(s.x, s.y, s.z);
      this.needsSpawn = false;
    }
    this.toTitle();
  }

  toTitle() {
    this.setState('title');
    this.input.exitLock();
    this.ui.show('title');
    this.titleAngle = this.player.yaw;
  }

  newWorld(seed) {
    this.saveGame();
    this.startWorld(seed, null);
    // Build the area around spawn right away so we can drop straight into the game.
    const cx = Math.floor(this.spawn.x / CHUNK);
    const cz = Math.floor(this.spawn.z / CHUNK);
    this.streamer.update(cx, cz, 400);
    this.settleSpawn();
    const s = this.respawnPoint();
    this.player.setPosition(s.x, s.y, s.z);
    this.needsSpawn = false;
    this.saveGame();
  }

  play() {
    this.ui.hideScreens();
    this.setState('playing');
    this.input.reset();
    this.input.requestLock();
    this.ui.setHealth(this.player.health);
    this.ui.selectSlot(this.selected);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.input.exitLock();
    document.getElementById('pause-hint').textContent = `Seed: ${this.seedText}`;
    this.ui.show('pause');
    this.saveGame();
  }

  openInventory() {
    if (this.state !== 'playing') return;
    this.setState('inventory');
    this.input.exitLock();
    this.ui.show('inventory');
  }

  closeInventory() {
    if (this.state !== 'inventory') return;
    this.play();
  }

  die() {
    this.setState('dead');
    this.input.exitLock();
    this.ui.show('dead');
  }

  respawn() {
    const s = this.respawnPoint();
    this.player.setPosition(s.x, s.y, s.z);
    this.player.health = PLAYER.maxHealth;
    this.player.flying = false;
    this.play();
  }

  selectSlot(i) {
    this.selected = (i + 9) % 9;
    this.ui.selectSlot(this.selected, this.hotbar[this.selected]);
  }

  // ---------------------------------------------------------------- interaction

  breakBlock(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    const def = BLOCKS[id];
    // Water flows into holes dug next to it.
    const wet = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(
      ([dx, dy, dz]) => w.getBlock(x + dx, y + dy, z + dz) === B.WATER,
    );
    w.setBlock(x, y, z, wet ? B.WATER : B.AIR);
    this.gfx.particles.burst(x + 0.5, y + 0.5, z + 0.5, def.color, def.color2 ?? def.color, def.parts ? 8 : 18);
    // Anything that needed this block for support pops off too.
    let yy = y + 1;
    for (;;) {
      const above = w.getBlock(x, yy, z);
      if (!(NEEDS_SUPPORT.has(above) || above === B.TORCH)) break;
      const adef = BLOCKS[above];
      w.setBlock(x, yy, z, B.AIR);
      this.gfx.particles.burst(x + 0.5, yy + 0.3, z + 0.5, adef.color, adef.color2 ?? adef.color, 8);
      yy++;
    }
    this.gfx.hand.swing();
  }

  placeBlock(hit) {
    const id = this.hotbar[this.selected];
    if (!id) return false;
    const w = this.world;
    let tx = hit.x + hit.nx;
    let ty = hit.y + hit.ny;
    let tz = hit.z + hit.nz;
    if (REPLACEABLE[hit.id]) {
      tx = hit.x;
      ty = hit.y;
      tz = hit.z;
    }
    if (ty < 1 || ty >= HEIGHT) return false;
    if (!REPLACEABLE[w.getBlock(tx, ty, tz)]) return false;
    if (SOLID[id] && this.player.intersectsBlock(tx, ty, tz)) return false;
    if (NEEDS_SUPPORT.has(id)) {
      const below = w.getBlock(tx, ty - 1, tz);
      const ok = id === B.CACTUS ? below === B.SAND || below === B.CACTUS : below === B.GRASS || below === B.DIRT;
      if (!ok) {
        this.ui.toast(id === B.CACTUS ? 'Cactus needs sand' : 'Plants need grass or dirt');
        return false;
      }
    }
    w.setBlock(tx, ty, tz, id);
    this.gfx.hand.swing();
    this.lastPlace = this.time;
    return true;
  }

  pickBlock(hit) {
    if (!INVENTORY_BLOCKS.includes(hit.id)) return;
    const existing = this.hotbar.indexOf(hit.id);
    if (existing >= 0) this.selectSlot(existing);
    else {
      this.hotbar[this.selected] = hit.id;
      this.ui.updateHotbar(this.hotbar);
      this.selectSlot(this.selected);
    }
  }

  targetBlock() {
    const p = this.player;
    p.eye(_eye);
    p.lookDir(_dir);
    const w = this.world;
    return raycast((x, y, z) => w.getBlock(x, y, z), _eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, PLAYER.reach,
      (id) => id !== B.AIR && id !== B.WATER);
  }

  /** Rough light level at the player's head, used to shade the first-person arm. */
  localBrightness() {
    const p = this.player.pos;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y + 1.6);
    const z = Math.floor(p.z);
    const chunk = this.world.getChunk(x >> 4, z >> 4);
    if (!chunk) return 1;
    const h = chunk.skyHeight[(z & 15) * CHUNK + (x & 15)];
    let sky = y >= h ? 1 : Math.max(0.05, 1 - 0.2 * (h - y));
    sky *= 0.25 + 0.75 * this.gfx.sky.daylight;
    let torch = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk((x >> 4) + dx, (z >> 4) + dz);
        if (!c) continue;
        const e = c.emitters;
        for (let i = 0; i < e.length; i += 4) {
          const ex = c.cx * CHUNK + e[i] + 0.5;
          const ey = e[i + 1] + 0.5;
          const ez = c.cz * CHUNK + e[i + 2] + 0.5;
          const d = Math.hypot(ex - p.x, ey - p.y - 1.6, ez - p.z);
          torch = Math.max(torch, 1 - d / e[i + 3]);
        }
      }
    }
    return Math.max(sky, torch * 0.9);
  }

  // ---------------------------------------------------------------- frame

  updatePlaying(dt) {
    const input = this.input;
    const p = this.player;
    const look = input.consumeLook();
    p.look(look.dx, look.dy);

    const wheel = input.consumeWheel();
    if (wheel) this.selectSlot(this.selected + wheel);

    // Freeze physics until the ground under the player exists.
    const ready = this.world.getChunk(Math.floor(p.pos.x) >> 4, Math.floor(p.pos.z) >> 4)?.meshed;
    let walking = false;
    if (ready) walking = p.update(dt, input.movement(), this.time).walking;

    if (p.health <= 0) {
      this.die();
      return { walking };
    }

    const hit = this.targetBlock();
    this.gfx.setTarget(hit);

    // Mining: hold to break, progress depends on hardness.
    const u = this.gfx.uniforms;
    if (input.breakHeld && hit && Number.isFinite(BLOCKS[hit.id].hardness)) {
      const b = this.breaking;
      if (!b || b.x !== hit.x || b.y !== hit.y || b.z !== hit.z) {
        this.breaking = { x: hit.x, y: hit.y, z: hit.z, progress: 0, swing: 0 };
      }
      const br = this.breaking;
      br.progress += dt / Math.max(0.05, BLOCKS[hit.id].hardness);
      br.swing += dt;
      if (br.swing > 0.25) {
        br.swing = 0;
        this.gfx.hand.swing();
      }
      if (br.progress >= 1) {
        this.breakBlock(hit.x, hit.y, hit.z);
        this.breaking = null;
      }
    } else {
      this.breaking = null;
    }
    if (this.breaking) {
      u.uBreak.value = Math.min(1, this.breaking.progress);
      u.uBreakPos.value.set(this.breaking.x, this.breaking.y, this.breaking.z);
    } else {
      u.uBreak.value = 0;
    }

    // Placing / picking.
    const actions = input.actions.splice(0);
    for (const a of actions) {
      if (!hit) continue;
      if (a === 'place') this.placeBlock(hit);
      else if (a === 'pick') this.pickBlock(hit);
    }
    if (input.placeHeld && hit && this.time - this.lastPlace > 0.25 && !actions.length) this.placeBlock(hit);

    this.ui.setHealth(Math.ceil(p.health));
    this.ui.setBadge(p.flying ? 'Flying' : '');
    if (this.time - this.lastSave > 20) this.saveGame();
    return { walking };
  }

  updateCamera(dt, walking) {
    const cam = this.gfx.camera;
    const p = this.player;
    if (this.state === 'title' || this.state === 'loading') {
      this.titleAngle += dt * 0.04;
      const s = this.spawn;
      if (!this.titleHeight) {
        // Hover above the tallest nearby terrain so the orbit never clips trees.
        let top = SEA_LEVEL;
        for (let dz = -12; dz <= 12; dz += 3) {
          for (let dx = -12; dx <= 12; dx += 3) top = Math.max(top, this.world.gen.heightAt(s.x + dx, s.z + dz));
        }
        this.titleHeight = top + 16;
      }
      cam.position.set(s.x + 0.5, this.titleHeight, s.z + 0.5);
      cam.rotation.set(-0.32, this.titleAngle, 0);
      this.gfx.setFov(this.settings.fov);
      return;
    }
    p.eye(cam.position);
    const bob = walking && !p.flying ? Math.sin(p.walkTime * 2.4) * 0.045 : 0;
    cam.position.y += Math.abs(bob);
    cam.rotation.set(p.pitch, p.yaw, bob * 0.15);
    const target = p.sprinting ? (p.flying ? 14 : 9) : 0;
    this.fovBoost += (target - this.fovBoost) * Math.min(1, dt * 8);
    this.gfx.setFov(this.settings.fov + this.fovBoost);
  }

  /** Drops the render resolution a notch when the frame rate stays low. */
  autoScale(frameSeconds) {
    const perf = this.perf;
    if (this.state !== 'playing' || document.hidden) {
      perf.time = 0;
      perf.frames = 0;
      return;
    }
    perf.time += frameSeconds;
    perf.frames++;
    if (perf.time < 4) return;
    const avg = perf.time / perf.frames;
    perf.time = 0;
    perf.frames = 0;
    if (avg > 1 / 24 && perf.scale > 0.6) {
      perf.scale = Math.max(0.6, perf.scale - 0.15);
      this.gfx.setResolutionScale(perf.scale);
    }
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const raw = Math.max(0, (t - this.lastFrame) / 1000);
    const dt = Math.min(0.05, raw);
    this.lastFrame = t;
    if (raw < 0.5) this.autoScale(raw);
    this.time += dt;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;

    if (this.settings.dayCycle && this.state !== 'loading') {
      const night = this.dayTime > 0.5;
      this.dayTime = (this.dayTime + (dt / DAY_LENGTH) * (night ? 2 : 1)) % 1;
    }

    // Stream chunks around whoever the camera follows.
    const focus = this.state === 'title' || this.state === 'loading' ? { x: this.spawn.x, z: this.spawn.z } : this.player.pos;
    const pcx = Math.floor(focus.x / CHUNK);
    const pcz = Math.floor(focus.z / CHUNK);
    const loading = this.state === 'loading';
    this.streamer.update(pcx, pcz, loading ? 40 : this.state === 'playing' ? 6 : 10);
    if (loading) {
      const r = Math.min(3, this.settings.renderDistance);
      const prog = this.streamer.progress(r);
      this.ui.setLoading(prog);
      if (prog >= 1) this.finishLoading();
    }

    let walking = false;
    if (this.state === 'playing') walking = this.updatePlaying(dt).walking;
    else this.gfx.setTarget(null);
    this.gfx.particles.update(dt, this.world);
    this.updateCamera(dt, walking);

    const underwater = this.state !== 'title' && this.state !== 'loading' && this.player.headInWater;
    this.gfx.uniforms.uUnderwater.value = underwater ? 1 : 0;
    this.ui.setUnderwater(underwater);

    this.gfx.render(dt, {
      dayTime: this.dayTime,
      time: this.time,
      focus: this.gfx.camera.position,
      showHand: this.state === 'playing' || this.state === 'inventory',
      handState: { walking, brightness: this.localBrightness() },
    });

    if (this.settings.debug && (this.state === 'playing' || this.state === 'inventory')) this.updateDebug();
  }

  updateDebug() {
    const p = this.player.pos;
    const st = this.gfx.chunks.stats();
    const info = this.gfx.renderer.info.render;
    const deg = ((((-this.player.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const facing = ['north', 'east', 'south', 'west'][Math.round(deg / 90) % 4];
    const hours = Math.floor(((this.dayTime * 24 + 6) % 24));
    this.ui.setDebug(
      `Spherecraft  ${Math.round(this.fps)} fps\n` +
        `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
        `Chunk ${Math.floor(p.x / CHUNK)}, ${Math.floor(p.z / CHUNK)}  facing ${facing}\n` +
        `Chunks ${st.chunks}  spheres ${st.instances.toLocaleString()}\n` +
        `Draw calls ${info.calls}  triangles ${info.triangles.toLocaleString()}\n` +
        `Resolution ${Math.round(this.gfx.renderer.getPixelRatio() * 100)}%\n` +
        `Time ${String(hours).padStart(2, '0')}:00  seed ${this.seedText}`,
    );
  }
}

function showFatal(message) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  const el = document.getElementById('error');
  el.classList.remove('hidden');
  document.getElementById('error-text').textContent = message;
}

try {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) throw new Error('WebGL 2 is not available in this browser.');
  window.spherecraft = new Game();
} catch (err) {
  console.error(err);
  showFatal(`${err.message || err}. Try a recent version of Chrome, Edge, Firefox or Safari.`);
}
