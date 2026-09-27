import './style.css';
import * as THREE from 'three';
import { CHUNK, HEIGHT, SEA_LEVEL, DAY_LENGTH, PLAYER } from './config.js';
import { B, BLOCKS, SOLID, OPAQUE, FLUID, REPLACEABLE, NEEDS_SUPPORT, INTERACTIVE } from './blocks.js';
import { I, itemDef, itemName, isFood, toolOf, miningFor, fuelValue } from './items.js';
import { World } from './world/world.js';
import { Fluids } from './world/fluids.js';
import { hashString } from './world/noise.js';
import { Graphics } from './render/graphics.js';
import { Player } from './game/player.js';
import { Input, IS_TOUCH } from './game/input.js';
import { Streamer } from './game/streamer.js';
import { Entities } from './game/entities.js';
import { Inventory } from './game/inventory.js';
import { raycast } from './game/raycast.js';
import { sfx, unlockAudio, setVolume } from './game/sound.js';
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
  difficulty: 'normal',
  newMode: 'survival',
  volume: 0.6,
};

const CREATIVE_HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.OAK_LOG, B.GLASS, B.TORCH, B.WOOL_RED];

const RANDOM_SEEDS = ['sphere', 'marble', 'bubble', 'orbit', 'pebble', 'gumball', 'boba', 'planet', 'dewdrop', 'bead'];

function randomSeed() {
  const word = RANDOM_SEEDS[Math.floor(Math.random() * RANDOM_SEEDS.length)];
  return `${word}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function seedNumber(text) {
  const t = String(text).trim();
  return /^-?\d+$/.test(t) ? Number(t) >>> 0 : hashString(t);
}

const LEAVES = new Set([B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();

class Game {
  constructor() {
    this.settings = storage.loadSettings(DEFAULT_SETTINGS);
    this.canvas = document.getElementById('game');
    this.gfx = new Graphics(this.canvas);
    this.input = new Input(this.canvas, document.getElementById('touch'));
    this.ui = new UI(this);
    this.entities = new Entities(this);
    if (IS_TOUCH) document.body.classList.add('touch');

    this.state = 'loading';
    this.time = 0;
    this.dayTime = 0.1;
    this.lastFrame = performance.now();
    this.fps = 60;
    this.selected = 0;
    this.breaking = null;
    this.lastPlace = -1;
    this.lastSave = 0;
    this.titleAngle = 0;
    this.fovBoost = 0;
    this.returnScreen = 'title';
    this.perf = { time: 0, frames: 0, scale: 1 };
    this.attackCooldown = 0;
    this.use = null; // ongoing right-button action: { kind: 'eat' | 'bow', t }
    this.cursor = null; // stack held by the mouse in the inventory screen
    this.openChest = null;
    this.station = null;
    this.growTimer = 0;
    this.stepDist = 0;
    this.shake = 0;

    this._bindUI();
    this._bindInput();
    this.applySettings();

    const save = storage.loadSave();
    this.startWorld(save?.seed ?? randomSeed(), save, save?.mode ?? this.settings.newMode);

    window.addEventListener('resize', () => this.gfx.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveGame();
    });
    window.addEventListener('pagehide', () => this.saveGame());
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- world

  startWorld(seedText, save, mode) {
    this.seedText = String(seedText);
    const sameWorld = !!(save && save.seed === this.seedText);
    const edits = sameWorld ? storage.decodeEdits(save.edits) : new Map();
    if (this.streamer) this.streamer.reset();
    this.world = new World(seedNumber(this.seedText), edits);
    this.fluids = new Fluids(this.world);
    this.world.onBlockChanged = (x, y, z) => this.fluids.scheduleAround(x, y, z);
    this.world.onChunkLoaded = (chunk) => {
      const s = chunk.springs;
      if (s) for (let i = 0; i < s.length; i += 3) this.fluids.schedule(s[i], s[i + 1], s[i + 2]);
    };
    this.streamer = new Streamer(this.world, this.gfx.chunks);
    this.streamer.setRadius(this.settings.renderDistance);
    this.entities.clear();
    this.player = new Player(this.world);
    this.player.autoJump = this.settings.autoJump;
    this.player.onDamage = () => {
      this.ui.flashDamage();
      sfx.hurt();
    };
    this.player.onLand = (d) => {
      if (d > 1.5 && !this.player.inWater) sfx.step();
    };
    this.spawn = this.findSpawnColumn();
    this.bedSpawn = sameWorld && save.bedSpawn ? save.bedSpawn : null;
    this.titleHeight = 0;
    this.mode = mode === 'creative' ? 'creative' : 'survival';
    this.containers = new Map();
    if (sameWorld && Array.isArray(save.containers)) {
      for (const [k, list] of save.containers) this.containers.set(k, Inventory.fromJSON(list, 27));
    }

    if (sameWorld && save.player) {
      const p = save.player;
      this.player.setPosition(p.x, p.y, p.z);
      this.player.yaw = p.yaw || 0;
      this.player.pitch = p.pitch || 0;
      this.player.flying = !!p.flying && this.mode === 'creative';
      this.player.health = p.health > 0 ? p.health : PLAYER.maxHealth;
      this.food = p.food ?? 20;
      this.saturation = p.saturation ?? 5;
      this.needsSpawn = false;
    } else {
      this.player.setPosition(this.spawn.x + 0.5, this.spawn.y + 1, this.spawn.z + 0.5);
      this.player.yaw = Math.PI * 0.75;
      this.food = 20;
      this.saturation = 5;
      this.needsSpawn = true;
    }
    this.exhaustion = 0;
    this.air = 10;
    this.fuel = sameWorld ? save.fuel || 0 : 0;
    this.dayTime = sameWorld && typeof save.dayTime === 'number' ? save.dayTime : 0.1;
    if (sameWorld && Array.isArray(save.inventory)) {
      this.inventory = Inventory.fromJSON(save.inventory);
      this.selected = Math.min(8, Math.max(0, save.selected | 0));
    } else {
      this.inventory = new Inventory();
      if (this.mode === 'creative') CREATIVE_HOTBAR.forEach((id, i) => this.inventory.set(i, { id, count: 64 }));
      this.selected = 0;
    }
    this.applyMode();
    this.ui.buildHotbar((i) => this.selectSlot(i));
    this.ui.selectSlot(this.selected, this.heldId());
    document.getElementById('seed-input').value = this.seedText;
  }

  applyMode() {
    const creative = this.mode === 'creative';
    this.player.invulnerable = creative;
    this.player.naturalRegen = false;
    if (!creative) this.player.flying = false;
    document.body.classList.toggle('creative', creative);
    const btn = document.getElementById('btn-gamemode');
    if (btn) btn.textContent = `Game mode: ${creative ? 'Creative' : 'Survival'}`;
  }

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
          if (!SOLID[ground] || LEAVES.has(ground)) continue;
          if (SOLID[w.getBlock(x, h + 1, z)] || SOLID[w.getBlock(x, h + 2, z)]) continue;
          this.spawn = { x, y: h, z };
          return;
        }
      }
    }
  }

  respawnPoint() {
    const base = this.bedSpawn || this.spawn;
    const { x, z } = base;
    let y = base.y + 1;
    while (y < HEIGHT - 2 && (SOLID[this.world.getBlock(x, y, z)] || SOLID[this.world.getBlock(x, y + 1, z)])) y++;
    return { x: x + 0.5, y, z: z + 0.5 };
  }

  saveGame() {
    if (!this.world || this.state === 'loading') return;
    const p = this.player;
    this.returnCursor();
    storage.writeSave({
      version: 2,
      seed: this.seedText,
      mode: this.mode,
      edits: storage.encodeEdits(this.world.edits),
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying, health: p.health, food: this.food, saturation: this.saturation },
      dayTime: this.dayTime,
      inventory: this.inventory.toJSON(),
      selected: this.selected,
      containers: [...this.containers].map(([k, inv]) => [k, inv.toJSON()]),
      bedSpawn: this.bedSpawn,
      fuel: this.fuel,
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
    setVolume(s.volume);
    const modeBtn = document.getElementById('btn-newmode');
    if (modeBtn) modeBtn.textContent = `New worlds: ${s.newMode === 'creative' ? 'Creative' : 'Survival'}`;
    storage.saveSettings(s);
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    const click = (id, fn) => $(id).addEventListener('click', () => {
      unlockAudio();
      sfx.click();
      fn();
    });
    click('btn-play', () => {
      const seed = $('seed-input').value.trim() || randomSeed();
      if (seed !== this.seedText) this.newWorld(seed, this.settings.newMode);
      this.play();
    });
    $('seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('btn-play').click();
    });
    click('btn-random', () => {
      $('seed-input').value = randomSeed();
      this.newWorld($('seed-input').value, this.settings.newMode);
      this.play();
    });
    click('btn-newmode', () => {
      this.settings.newMode = this.settings.newMode === 'creative' ? 'survival' : 'creative';
      this.applySettings();
    });
    click('btn-resume', () => this.play());
    click('btn-gamemode', () => {
      this.mode = this.mode === 'creative' ? 'survival' : 'creative';
      this.applyMode();
      this.ui.toast(`${this.mode === 'creative' ? 'Creative' : 'Survival'} mode`);
    });
    click('btn-title', () => {
      this.saveGame();
      this.toTitle();
    });
    const openSettings = (from) => {
      this.returnScreen = from;
      this.syncSettingsForm();
      this.ui.show('settings');
    };
    click('btn-settings', () => openSettings('pause'));
    click('btn-title-settings', () => openSettings('title'));
    click('btn-settings-done', () => this.ui.show(this.returnScreen));
    const openHelp = (from) => {
      this.returnScreen = from;
      this.ui.show('help');
    };
    click('btn-help', () => openHelp('pause'));
    click('btn-title-help', () => openHelp('title'));
    click('btn-help-done', () => this.ui.show(this.returnScreen));
    click('btn-inv-done', () => this.closeInventory());
    click('btn-respawn', () => this.respawn());
    $('touch-pause').addEventListener('click', () => this.pause());
    $('touch-inv').addEventListener('click', () => this.openInventory());

    const bindRange = (id, out, key, fmt) => {
      const input = $(id);
      input.addEventListener('input', () => {
        this.settings[key] = Number(input.value);
        $(out).textContent = fmt(this.settings[key]);
        this.applySettings();
      });
    };
    bindRange('set-distance', 'out-distance', 'renderDistance', (v) => `${v} chunks`);
    bindRange('set-fov', 'out-fov', 'fov', (v) => `${v}°`);
    bindRange('set-sens', 'out-sens', 'sensitivity', (v) => `${v.toFixed(1)}×`);
    bindRange('set-res', 'out-res', 'resolution', (v) => `${Math.round(v * 100)}%`);
    bindRange('set-volume', 'out-volume', 'volume', (v) => `${Math.round(v * 100)}%`);
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
    $('set-peaceful').addEventListener('change', (e) => {
      this.settings.difficulty = e.target.checked ? 'peaceful' : 'normal';
      this.applySettings();
    });
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
    $('set-volume').value = s.volume;
    $('out-volume').textContent = `${Math.round(s.volume * 100)}%`;
    $('set-shadows').checked = s.shadows;
    $('set-daycycle').checked = s.dayCycle;
    $('set-autojump').checked = s.autoJump;
    $('set-fps').checked = s.debug;
    $('set-peaceful').checked = s.difficulty === 'peaceful';
  }

  _bindInput() {
    const input = this.input;
    input.onKey = (code, e, first) => {
      if (!first) return;
      if (this.state === 'playing') {
        if (code.startsWith('Digit')) {
          const n = Number(code.slice(5));
          if (n >= 1 && n <= 9) this.selectSlot(n - 1);
        } else if (code === 'KeyE') this.openInventory();
        else if (code === 'KeyQ') this.dropHeld(e.ctrlKey);
        else if (code === 'F3') {
          this.settings.debug = !this.settings.debug;
          this.applySettings();
        } else if (code === 'Escape' && (input.dragMode || input.touch)) this.pause();
        else if (code === 'KeyF' && this.mode === 'creative') this.player.toggleFly();
      } else if (this.state === 'inventory') {
        if (code === 'KeyE' || code === 'Escape') this.closeInventory();
        else if (code.startsWith('Digit')) {
          const n = Number(code.slice(5));
          if (n >= 1 && n <= 9) this.selectSlot(n - 1);
        }
      }
    };
    input.onDoubleJump = () => {
      if (this.state === 'playing' && this.mode === 'creative') this.player.toggleFly();
    };
    input.onLockChange = (locked, failure) => {
      if (failure === 'unsupported') {
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
      unlockAudio();
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
      this.use = null;
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

  newWorld(seed, mode) {
    this.saveGame();
    this.startWorld(seed, null, mode);
    const cx = Math.floor(this.spawn.x / CHUNK);
    const cz = Math.floor(this.spawn.z / CHUNK);
    this.streamer.buildNow(cx, cz, 2);
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
    this.ui.selectSlot(this.selected, this.heldId());
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.input.exitLock();
    document.getElementById('pause-hint').textContent = `Seed: ${this.seedText}`;
    this.applyMode();
    this.ui.show('pause');
    this.saveGame();
  }

  openInventory(chest = null, station = null) {
    if (this.state !== 'playing') return;
    this.openChest = chest;
    this.station = station || this.nearbyStation();
    this.setState('inventory');
    this.input.exitLock();
    this.ui.show('inventory');
    this.ui.renderInventory();
  }

  closeInventory() {
    if (this.state !== 'inventory') return;
    this.returnCursor();
    this.openChest = null;
    this.play();
  }

  returnCursor() {
    if (!this.cursor) return;
    const left = this.inventory.add(this.cursor.id, this.cursor.count, this.cursor.dur);
    if (left > 0) this.entities.dropItem(this.cursor.id, left, this.player.pos.x, this.player.pos.y + 1.4, this.player.pos.z);
    this.cursor = null;
  }

  die() {
    this.setState('dead');
    this.input.exitLock();
    if (this.mode === 'survival') {
      const p = this.player.pos;
      for (const s of this.inventory.slots) {
        if (s) this.entities.dropItem(s.id, s.count, p.x, p.y + 1, p.z, true, s.dur);
      }
      this.inventory.clear();
    }
    this.ui.show('dead');
  }

  respawn() {
    const s = this.respawnPoint();
    this.player.setPosition(s.x, s.y, s.z);
    this.player.health = PLAYER.maxHealth;
    this.player.flying = false;
    this.food = 20;
    this.saturation = 5;
    this.air = 10;
    this.play();
  }

  selectSlot(i) {
    this.selected = (i + 9) % 9;
    this.use = null;
    this.ui.selectSlot(this.selected, this.heldId());
  }

  heldStack() {
    return this.inventory.get(this.selected);
  }

  heldId() {
    return this.heldStack()?.id || 0;
  }

  /** Uses up one of the held item (not in creative). */
  consumeHeld(n = 1) {
    if (this.mode === 'creative') return;
    this.inventory.take(this.selected, n);
  }

  /** Wears down the held tool; breaks it when durability runs out. */
  wearHeld(amount = 1) {
    if (this.mode === 'creative') return;
    const s = this.heldStack();
    if (!s || s.dur === undefined) return;
    s.dur -= amount;
    this.inventory.version++;
    if (s.dur <= 0) {
      this.inventory.set(this.selected, null);
      sfx.breakTool();
      this.ui.toast(`${itemName(s.id)} broke`);
    }
  }

  dropHeld(all) {
    const s = this.heldStack();
    if (!s) return;
    const p = this.player;
    p.lookDir(_dir);
    const taken = this.inventory.take(this.selected, all ? s.count : 1);
    this.entities.dropItem(taken.id, taken.count, p.pos.x + _dir.x * 0.6, p.pos.y + 1.3, p.pos.z + _dir.z * 0.6, false, taken.dur);
    const it = this.entities.items[this.entities.items.length - 1];
    if (it) {
      it.vel.set(_dir.x * 5, _dir.y * 5 + 2, _dir.z * 5);
      it.pickupDelay = 1.5;
    }
  }

  onPickup() {
    sfx.pickup();
  }

  nearbyStation() {
    const p = this.player.pos;
    const w = this.world;
    let table = false;
    let furnace = false;
    for (let y = -3; y <= 3; y++) {
      for (let z = -4; z <= 4; z++) {
        for (let x = -4; x <= 4; x++) {
          const id = w.getBlock(Math.floor(p.x) + x, Math.floor(p.y) + y, Math.floor(p.z) + z);
          if (id === B.CRAFTING_TABLE) table = true;
          else if (id === B.FURNACE) furnace = true;
        }
      }
    }
    return { table, furnace };
  }

  // ---------------------------------------------------------------- crafting

  canCraft(r) {
    if (r.station === 'table' && !this.station?.table) return false;
    if (r.station === 'furnace') {
      if (!this.station?.furnace) return false;
      if (this.mode === 'survival' && this.fuel <= 0 && !this.findFuel()) return false;
    }
    if (this.mode === 'creative') return true;
    return r.inputs.every(([id, n]) => this.inventory.count(id) >= n) && this.inventory.hasRoomFor(r.out);
  }

  findFuel() {
    for (const s of this.inventory.slots) if (s && fuelValue(s.id) > 0) return s.id;
    return 0;
  }

  craft(r) {
    if (!this.canCraft(r)) return false;
    if (r.station === 'furnace' && this.mode === 'survival') {
      if (this.fuel <= 0) {
        const f = this.findFuel();
        this.inventory.remove(f, 1);
        this.fuel += fuelValue(f);
      }
      this.fuel--;
    }
    if (this.mode === 'survival') for (const [id, n] of r.inputs) this.inventory.remove(id, n);
    const left = this.inventory.add(r.out, r.count);
    if (left > 0) this.entities.dropItem(r.out, left, this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z);
    sfx.craft();
    return true;
  }

  // ---------------------------------------------------------------- interaction

  targetBlock(fluids = false) {
    const p = this.player;
    p.eye(_eye);
    p.lookDir(_dir);
    const w = this.world;
    return raycast((x, y, z) => w.getBlock(x, y, z), _eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, PLAYER.reach,
      fluids ? (id) => id === B.WATER || (id !== B.AIR && !FLUID[id]) : (id) => id !== B.AIR && !FLUID[id]);
  }

  breakBlock(x, y, z, harvest) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    const def = BLOCKS[id];
    // Chests spill their contents.
    if (id === B.CHEST) {
      const key = `${x},${y},${z}`;
      const inv = this.containers.get(key);
      if (inv) for (const s of inv.slots) if (s) this.entities.dropItem(s.id, s.count, x + 0.5, y + 0.5, z + 0.5, true, s.dur);
      this.containers.delete(key);
    }
    w.setBlock(x, y, z, B.AIR);
    if (this.mode === 'survival' && harvest) this.entities.dropBlock(id, x, y, z);
    this.gfx.particles.burst(x + 0.5, y + 0.5, z + 0.5, def.color, def.color2 ?? def.color, def.parts ? 8 : 18);
    sfx.pop();
    // Anything that needed this block for support pops off too.
    for (let yy = y + 1; ; yy++) {
      const above = w.getBlock(x, yy, z);
      if (!NEEDS_SUPPORT.has(above)) break;
      w.setBlock(x, yy, z, B.AIR);
      if (this.mode === 'survival') this.entities.dropBlock(above, x, yy, z);
      const adef = BLOCKS[above];
      this.gfx.particles.burst(x + 0.5, yy + 0.3, z + 0.5, adef.color, adef.color2 ?? adef.color, 8);
    }
    this.gfx.hand.swing();
  }

  supportOk(id, x, y, z) {
    const below = this.world.getBlock(x, y - 1, z);
    if (id === B.CACTUS) return below === B.SAND || below === B.CACTUS;
    if (id === B.WHEAT_0) return below === B.FARMLAND;
    if (id === B.TORCH) {
      if (SOLID[below]) return true;
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => OPAQUE[this.world.getBlock(x + dx, y, z + dz)]);
    }
    return below === B.GRASS || below === B.DIRT || below === B.FARMLAND;
  }

  placeBlock(hit, id) {
    const w = this.world;
    let tx = hit.x + hit.nx;
    let ty = hit.y + hit.ny;
    let tz = hit.z + hit.nz;
    if (REPLACEABLE[hit.id] && !FLUID[hit.id]) {
      tx = hit.x;
      ty = hit.y;
      tz = hit.z;
    }
    if (ty < 1 || ty >= HEIGHT) return false;
    if (!REPLACEABLE[w.getBlock(tx, ty, tz)]) return false;
    if (SOLID[id] && this.player.intersectsBlock(tx, ty, tz)) return false;
    for (const m of this.entities.mobs) {
      if (SOLID[id] && Math.abs(m.pos.x - tx - 0.5) < m.hw + 0.5 && Math.abs(m.pos.z - tz - 0.5) < m.hw + 0.5 && m.pos.y < ty + 1 && m.pos.y + m.h > ty) return false;
    }
    if (NEEDS_SUPPORT.has(id) && !this.supportOk(id, tx, ty, tz)) {
      this.ui.toast(id === B.CACTUS ? 'Cactus needs sand' : id === B.WHEAT_0 ? 'Seeds need farmland' : id === B.TORCH ? 'Torches need something to stand on' : 'Plants need grass or dirt');
      return false;
    }
    w.setBlock(tx, ty, tz, id);
    if (id === B.CHEST) this.containers.set(`${tx},${ty},${tz}`, new Inventory(27));
    this.gfx.hand.swing();
    sfx.place();
    this.lastPlace = this.time;
    return true;
  }

  /** Right-click: interact with blocks, eat, draw a bow, use tools, or place. */
  useItem(hit, pressed) {
    const held = this.heldId();
    const def = itemDef(held);
    const w = this.world;
    const sneaking = this.player.sneaking;

    if (pressed && hit && INTERACTIVE.has(hit.id) && !sneaking) {
      this.interact(hit);
      return;
    }
    if (pressed && isFood(held) && (this.food < 20 || this.mode === 'creative')) {
      this.use = { kind: 'eat', t: 0 };
      return;
    }
    if (pressed && held === I.BOW) {
      if (this.mode === 'creative' || this.inventory.count(I.ARROW) > 0) this.use = { kind: 'bow', t: 0 };
      else this.ui.toast('You need arrows');
      return;
    }
    if (held === I.BUCKET) {
      if (!pressed) return;
      const wh = this.targetBlock(true);
      if (wh && wh.id === B.WATER) {
        w.setBlock(wh.x, wh.y, wh.z, B.AIR);
        if (this.mode === 'survival') {
          this.consumeHeld();
          const left = this.inventory.add(I.WATER_BUCKET, 1);
          if (left) this.entities.dropItem(I.WATER_BUCKET, 1, this.player.pos.x, this.player.pos.y + 1, this.player.pos.z);
        }
        sfx.splash();
        this.gfx.hand.swing();
      }
      return;
    }
    if (!hit) return;
    if (held === I.WATER_BUCKET) {
      if (!pressed) return;
      const tx = hit.x + hit.nx;
      const ty = hit.y + hit.ny;
      const tz = hit.z + hit.nz;
      if (REPLACEABLE[w.getBlock(tx, ty, tz)]) {
        w.setBlock(tx, ty, tz, B.WATER);
        if (this.mode === 'survival') this.inventory.set(this.selected, { id: I.BUCKET, count: 1 });
        sfx.splash();
        this.gfx.hand.swing();
      }
      return;
    }
    const tool = toolOf(held);
    if (tool && tool.kind === 'hoe') {
      if (!pressed) return;
      if ((hit.id === B.GRASS || hit.id === B.DIRT) && !SOLID[w.getBlock(hit.x, hit.y + 1, hit.z)]) {
        if (w.getBlock(hit.x, hit.y + 1, hit.z) !== B.AIR) w.setBlock(hit.x, hit.y + 1, hit.z, B.AIR);
        w.setBlock(hit.x, hit.y, hit.z, B.FARMLAND);
        this.wearHeld();
        this.gfx.hand.swing();
        sfx.dig();
      }
      return;
    }
    if (held === I.SEEDS) {
      if (!pressed) return;
      if (hit.id === B.FARMLAND && w.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
        w.setBlock(hit.x, hit.y + 1, hit.z, B.WHEAT_0);
        this.consumeHeld();
        this.gfx.hand.swing();
        sfx.place();
      }
      return;
    }
    if (held === I.BONE_MEAL) {
      if (!pressed) return;
      if (this.grow(hit.x, hit.y, hit.z, true)) {
        this.consumeHeld();
        this.gfx.particles.burst(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, 0x7cff6a, 0xffffff, 10);
        this.gfx.hand.swing();
      }
      return;
    }
    if (def && def.block !== undefined) {
      if (!pressed && this.time - this.lastPlace < 0.22) return;
      if (this.placeBlock(hit, def.block)) this.consumeHeld();
    }
  }

  interact(hit) {
    const { x, y, z, id } = hit;
    this.gfx.hand.swing();
    if (id === B.CRAFTING_TABLE) this.openInventory(null, { table: true, furnace: this.nearbyStation().furnace });
    else if (id === B.FURNACE) this.openInventory(null, { table: this.nearbyStation().table, furnace: true });
    else if (id === B.CHEST) {
      const key = `${x},${y},${z}`;
      if (!this.containers.has(key)) this.containers.set(key, new Inventory(27));
      this.openInventory(this.containers.get(key));
    } else if (id === B.KEG) {
      this.entities.igniteKeg(x, y, z);
      sfx.hiss();
    } else if (id === B.BED) {
      this.bedSpawn = { x, y, z };
      const night = this.dayTime > 0.52 && this.dayTime < 0.98;
      const danger = this.entities.mobs.some((m) => m.def.hostile && m.pos.distanceTo(this.player.pos) < 10);
      if (!night) this.ui.toast('Respawn point set. You can only sleep at night');
      else if (danger) this.ui.toast('You may not rest now, there are monsters nearby');
      else {
        this.ui.sleep();
        setTimeout(() => {
          this.dayTime = 0.02;
          this.ui.toast('Good morning!');
        }, 900);
      }
    }
  }

  /** Advances a crop or sapling. Returns true if something grew. */
  grow(x, y, z, boost) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (id >= B.WHEAT_0 && id < B.WHEAT_3) {
      w.setBlock(x, y, z, Math.min(B.WHEAT_3, id + (boost ? 2 : 1)));
      return true;
    }
    if (id === B.SAPLING) {
      if (!boost && Math.random() < 0.5) return false;
      this.growTree(x, y, z);
      return true;
    }
    return false;
  }

  growTree(x, y, z) {
    const w = this.world;
    const h = 4 + Math.floor(Math.random() * 3);
    for (let i = 1; i <= h + 1; i++) if (SOLID[w.getBlock(x, y + i, z)]) return;
    for (let i = 0; i < h; i++) w.setBlock(x, y + i, z, B.OAK_LOG);
    const R = 2.4;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dy * dy * 1.2 + dz * dz > R * R) continue;
          const bx = x + dx;
          const by = y + h + dy;
          const bz = z + dz;
          if (w.getBlock(bx, by, bz) === B.AIR) w.setBlock(bx, by, bz, B.OAK_LEAVES);
        }
      }
    }
  }

  updateGrowth(dt) {
    this.growTimer += dt;
    if (this.growTimer < 2) return;
    this.growTimer = 0;
    const p = this.player.pos;
    const pcx = Math.floor(p.x) >> 4;
    const pcz = Math.floor(p.z) >> 4;
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const c = this.world.getChunk(pcx + dx, pcz + dz);
        if (!c || !c.growables?.length) continue;
        const g = c.growables.slice();
        for (let i = 0; i < g.length; i += 3) {
          if (Math.random() < 0.06) this.grow(c.cx * CHUNK + g[i], g[i + 1], c.cz * CHUNK + g[i + 2], false);
        }
      }
    }
  }

  pickBlock(hit) {
    if (this.mode !== 'creative' || !itemDef(hit.id)) return;
    const idx = this.inventory.slots.slice(0, 9).findIndex((s) => s && s.id === hit.id);
    if (idx >= 0) this.selectSlot(idx);
    else {
      this.inventory.set(this.selected, { id: hit.id, count: 64 });
      this.selectSlot(this.selected);
    }
  }

  localLight() {
    const p = this.player.pos;
    return this.world.lightAt(p.x, p.y + 1.6, p.z);
  }

  // ---------------------------------------------------------------- survival stats

  updateSurvival(dt, walking) {
    const p = this.player;
    if (this.mode !== 'survival') {
      this.food = 20;
      this.air = 10;
      return;
    }
    this.exhaustion += dt * (0.012 + (p.sprinting ? 0.12 : 0) + (p.inWater ? 0.03 : 0) + (walking ? 0.01 : 0));
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    p.tooHungryToSprint = this.food <= 6;
    this.regenT = (this.regenT || 0) + dt;
    if (this.regenT > 4) {
      this.regenT = 0;
      if (this.food >= 18 && p.health > 0 && p.health < PLAYER.maxHealth) {
        p.health = Math.min(PLAYER.maxHealth, p.health + 1);
        this.exhaustion += 3;
      } else if (this.food <= 0 && p.health > 1) {
        p.damage(1, this.time);
      }
    }
    if (p.headInWater) {
      this.air -= dt / 1.5;
      if (this.air < 0) {
        this.air = 0;
        this.drownT = (this.drownT || 0) + dt;
        if (this.drownT > 1) {
          this.drownT = 0;
          p.damage(2, this.time);
        }
      }
    } else {
      this.air = Math.min(10, this.air + dt * 5);
    }
  }

  // ---------------------------------------------------------------- frame

  updatePlaying(dt) {
    const input = this.input;
    const p = this.player;
    const look = input.consumeLook();
    p.look(look.dx, look.dy);

    const wheel = input.consumeWheel();
    if (wheel) this.selectSlot(this.selected + wheel);

    const ready = this.world.getChunk(Math.floor(p.pos.x) >> 4, Math.floor(p.pos.z) >> 4)?.meshed;
    let walking = false;
    const mv = input.movement();
    if (this.use) {
      mv.forward *= 0.35;
      mv.strafe *= 0.35;
      mv.sprint = false;
    }
    if (ready) walking = p.update(dt, mv, this.time).walking;

    if (walking) {
      this.stepDist += dt * Math.hypot(p.vel.x, p.vel.z);
      if (this.stepDist > 2.2) {
        this.stepDist = 0;
        sfx.step();
      }
    }
    if (p.enteredWater && p.vel.y < -3) {
      this.gfx.addRipple(p.pos.x, p.pos.z, Math.min(2, -p.vel.y / 6));
      this.gfx.particles.burst(p.pos.x, p.pos.y + 0.3, p.pos.z, 0xbfe0ff, 0x6aa8f0, 16);
      sfx.splash();
    } else if (p.inWater && !p.headInWater && Math.hypot(p.vel.x, p.vel.z) > 1 && Math.random() < dt * 3) {
      this.gfx.addRipple(p.pos.x, p.pos.z, 0.5);
    }

    this.updateSurvival(dt, walking);
    if (p.health <= 0) {
      this.die();
      return { walking };
    }

    const hit = this.targetBlock();
    p.eye(_eye);
    p.lookDir(_dir);
    const mobHit = this.entities.raycastMob(_eye, _dir, Math.min(4, hit ? hit.t : 4));
    this.gfx.setTarget(mobHit ? null : hit);

    // Attacking mobs takes priority over mining.
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const u = this.gfx.uniforms;
    if (input.breakHeld && mobHit) {
      this.breaking = null;
      if (this.attackCooldown <= 0) {
        const tool = toolOf(this.heldId());
        const dmg = tool ? tool.damage : 1;
        const crit = p.vel.y < -1 && !p.onGround;
        this.entities.hurtMob(mobHit.mob, crit ? Math.ceil(dmg * 1.5) : dmg, p.pos);
        sfx.mobHurt();
        this.gfx.hand.swing();
        this.wearHeld(tool && tool.kind === 'sword' ? 1 : 2);
        this.attackCooldown = tool && tool.kind === 'sword' ? 0.45 : 0.6;
        this.exhaustion += 0.1;
      }
    } else if (input.breakHeld && hit && Number.isFinite(BLOCKS[hit.id].hardness)) {
      const b = this.breaking;
      if (!b || b.x !== hit.x || b.y !== hit.y || b.z !== hit.z) {
        this.breaking = { x: hit.x, y: hit.y, z: hit.z, progress: 0, swing: 0, cooldown: b?.cooldown || 0 };
      }
      const br = this.breaking;
      const mining = miningFor(hit.id, this.heldId());
      if (this.mode === 'creative') {
        br.cooldown -= dt;
        if (br.cooldown <= 0) br.progress = 1;
      } else {
        br.progress += (dt * mining.speed) / Math.max(0.05, BLOCKS[hit.id].hardness);
      }
      br.swing += dt;
      if (br.swing > 0.25) {
        br.swing = 0;
        this.gfx.hand.swing();
        sfx.dig();
      }
      if (br.progress >= 1) {
        const hardness = BLOCKS[hit.id].hardness;
        this.breakBlock(hit.x, hit.y, hit.z, mining.canHarvest);
        if (toolOf(this.heldId()) && hardness > 0.05) this.wearHeld();
        this.exhaustion += 0.005;
        this.breaking = { x: NaN, y: 0, z: 0, progress: 0, swing: 0, cooldown: 0.2 };
      }
    } else {
      this.breaking = null;
    }
    if (this.breaking && Number.isFinite(this.breaking.x)) {
      u.uBreak.value = Math.min(1, this.breaking.progress);
      u.uBreakPos.value.set(this.breaking.x, this.breaking.y, this.breaking.z);
    } else {
      u.uBreak.value = 0;
    }

    const actions = input.actions.splice(0);
    for (const a of actions) {
      if (a === 'place') this.useItem(hit, true);
      else if (a === 'pick' && hit) this.pickBlock(hit);
    }
    if (input.placeHeld && !actions.length && !this.use) this.useItem(hit, false);
    this.updateUse(dt);

    this.ui.updateHud();
    this.ui.setBadge(p.flying ? 'Flying' : '');
    if (this.time - this.lastSave > 20) this.saveGame();
    return { walking };
  }

  updateUse(dt) {
    const u = this.use;
    if (!u) return;
    const held = this.heldId();
    if (u.kind === 'eat') {
      if (!this.input.placeHeld || !isFood(held)) {
        this.use = null;
        return;
      }
      u.t += dt;
      if (Math.random() < dt * 8) sfx.eat();
      if (u.t >= 1.6) {
        const f = itemDef(held).food;
        this.food = Math.min(20, this.food + f);
        this.saturation = Math.min(this.food, this.saturation + f * 0.6);
        this.consumeHeld();
        sfx.burp();
        this.use = null;
      }
    } else if (u.kind === 'bow') {
      if (held !== I.BOW) {
        this.use = null;
        return;
      }
      u.t += dt;
      if (!this.input.placeHeld) {
        const power = Math.min(1, u.t);
        if (power > 0.15) {
          const p = this.player;
          p.eye(_eye);
          p.lookDir(_dir);
          this.entities.shootArrow('player', _eye.clone().addScaledVector(_dir, 0.5), _dir.clone(), 12 + power * 28, 2 + power * 7);
          if (this.mode === 'survival') this.inventory.remove(I.ARROW, 1);
          this.wearHeld();
          sfx.bow();
        }
        this.use = null;
      }
    }
  }

  updateCamera(dt, walking) {
    const cam = this.gfx.camera;
    const p = this.player;
    if (this.state === 'title' || this.state === 'loading') {
      this.titleAngle += dt * 0.04;
      const s = this.spawn;
      if (!this.titleHeight) {
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
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.15;
    cam.rotation.set(p.pitch + (Math.random() - 0.5) * sh, p.yaw + (Math.random() - 0.5) * sh, bob * 0.15);
    let target = p.sprinting ? (p.flying ? 14 : 9) : 0;
    if (this.use?.kind === 'bow') target -= Math.min(1, this.use.t) * 12;
    this.fovBoost += (target - this.fovBoost) * Math.min(1, dt * 8);
    this.gfx.setFov(this.settings.fov + this.fovBoost);
  }

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
    const active = this.state === 'playing' || this.state === 'inventory';
    if (this.state === 'playing') walking = this.updatePlaying(dt).walking;
    else this.gfx.setTarget(null);
    if (active) {
      this.fluids.update(dt);
      this.entities.update(dt);
      this.updateGrowth(dt);
      if (this.state === 'inventory') this.ui.updateHud();
    }
    this.entities.render(this.gfx.entities, this.time);
    this.gfx.particles.update(dt, this.world);
    this.updateCamera(dt, walking);

    const underwater = this.state !== 'title' && this.state !== 'loading' && this.player.headInWater;
    this.gfx.uniforms.uUnderwater.value = underwater ? 1 : 0;
    this.ui.setUnderwater(underwater);

    const l = this.localLight();
    this.gfx.hand.setHeld(this.heldId());
    this.gfx.render(dt, {
      dayTime: this.dayTime,
      time: this.time,
      focus: this.gfx.camera.position,
      showHand: active,
      handState: { walking, sky: l.sky, torch: l.torch, eating: this.use?.kind === 'eat' },
    });

    if (this.settings.debug && active) this.updateDebug();
  }

  updateDebug() {
    const p = this.player.pos;
    const st = this.gfx.chunks.stats();
    const info = this.gfx.renderer.info.render;
    const deg = ((((-this.player.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const facing = ['north', 'east', 'south', 'west'][Math.round(deg / 90) % 4];
    const hours = Math.floor((this.dayTime * 24 + 6) % 24);
    this.ui.setDebug(
      `Spherecraft  ${Math.round(this.fps)} fps  ${this.mode}\n` +
        `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
        `Chunk ${Math.floor(p.x / CHUNK)}, ${Math.floor(p.z / CHUNK)}  facing ${facing}\n` +
        `Chunks ${st.chunks}  spheres ${st.instances.toLocaleString()}\n` +
        `Mobs ${this.entities.mobs.length}  items ${this.entities.items.length}  water updates ${this.fluids.queue.size}\n` +
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
