// Everything that moves in the world besides the player: mobs, dropped items,
// arrows and lit powder kegs. Handles AI, spawning, combat and explosions.

import * as THREE from 'three';
import { B, BLOCKS, SOLID, FLUID, OPAQUE } from '../blocks.js';
import { itemDef, dropsFor, I } from '../items.js';
import { MOBS, PASSIVE_TYPES, HOSTILE_TYPES } from './mobs.js';
import { moveBody, rayBox } from './body.js';
import { itemModel } from '../render/itemModels.js';
import { linearColor } from '../render/entities.js';
import { raycast } from './raycast.js';

const _qYaw = new THREE.Quaternion();
const _qPart = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(1, 1, 1);

let nextId = 1;

function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

export class Entities {
  constructor(game) {
    this.game = game;
    this.mobs = [];
    this.items = [];
    this.arrows = [];
    this.kegs = [];
    this.spawnTimer = 0;
    this.mergeTimer = 0;
  }

  clear() {
    this.mobs.length = 0;
    this.items.length = 0;
    this.arrows.length = 0;
    this.kegs.length = 0;
  }

  get world() {
    return this.game.world;
  }

  // ------------------------------------------------------------------ spawning

  spawnMob(type, x, y, z) {
    const def = MOBS[type];
    const mob = {
      id: nextId++, type, def,
      pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(),
      hw: def.hw, h: def.h, onGround: false,
      hp: def.hp, yaw: Math.random() * Math.PI * 2, walk: 0, speedNow: 0,
      target: null, wanderT: 0, fleeT: 0, hurtT: 0, attackT: 0, fuse: 0, burnT: 0, age: 0,
      seed: Math.random(),
    };
    this.mobs.push(mob);
    return mob;
  }

  _surfaceSpot(x, z) {
    const top = this.world.topSolid(x, z);
    if (top < 0) return null;
    const ground = this.world.getBlock(x, top, z);
    if (FLUID[this.world.getBlock(x, top + 1, z)]) return null;
    return { y: top + 1, ground };
  }

  _trySpawn(dt) {
    this.spawnTimer += dt;
    if (this.spawnTimer < 1) return;
    this.spawnTimer = 0;
    const g = this.game;
    const p = g.player.pos;
    let passive = 0;
    let hostile = 0;
    for (const m of this.mobs) {
      if (m.pos.distanceTo(p) > 90) continue;
      if (m.def.hostile) hostile++;
      else passive++;
    }
    const daylight = g.gfx.sky.daylight;
    // Animals graze on grass in herds.
    if (passive < 10 && Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      const d = 24 + Math.random() * 24;
      const x = Math.floor(p.x + Math.cos(a) * d);
      const z = Math.floor(p.z + Math.sin(a) * d);
      const s = this._surfaceSpot(x, z);
      if (s && s.ground === B.GRASS) {
        const type = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
        const n = randInt(2, 4);
        for (let i = 0; i < n; i++) {
          const ox = x + randInt(-2, 2);
          const oz = z + randInt(-2, 2);
          const s2 = this._surfaceSpot(ox, oz);
          if (s2 && s2.ground === B.GRASS) this.spawnMob(type, ox + 0.5, s2.y, oz + 0.5);
        }
      }
    }
    if (g.settings.difficulty === 'peaceful') return;
    const cap = daylight < 0.4 ? 14 : 6;
    if (hostile >= cap) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 24;
      const x = Math.floor(p.x + Math.cos(a) * d);
      const z = Math.floor(p.z + Math.sin(a) * d);
      let y;
      if (Math.random() < 0.5) {
        const s = this._surfaceSpot(x, z);
        if (!s) continue;
        y = s.y;
      } else {
        // Somewhere in a cave below.
        const top = this.world.topSolid(x, z);
        if (top < 8) continue;
        y = randInt(4, top - 4);
        let found = false;
        for (let k = 0; k < 10 && y > 2; k++, y--) {
          if (!SOLID[this.world.getBlock(x, y, z)] && !SOLID[this.world.getBlock(x, y + 1, z)] && SOLID[this.world.getBlock(x, y - 1, z)]) {
            found = true;
            break;
          }
        }
        if (!found) continue;
      }
      if (FLUID[this.world.getBlock(x, y, z)] || SOLID[this.world.getBlock(x, y + 1, z)]) continue;
      const l = this.world.lightAt(x + 0.5, y + 0.5, z + 0.5);
      if (Math.max(l.sky * daylight, l.torch) > 0.28) continue;
      const type = HOSTILE_TYPES[Math.floor(Math.random() * HOSTILE_TYPES.length)];
      this.spawnMob(type, x + 0.5, y, z + 0.5);
      break;
    }
  }

  // ------------------------------------------------------------------ items

  dropItem(id, count, x, y, z, fling = true, dur) {
    if (!itemDef(id) || count <= 0) return;
    this.items.push({
      id, count, dur,
      pos: new THREE.Vector3(x, y, z),
      vel: fling ? new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3) : new THREE.Vector3(),
      hw: 0.15, h: 0.25, onGround: false, age: 0, pickupDelay: 0.5, spin: Math.random() * 6,
    });
  }

  dropBlock(blockId, x, y, z) {
    for (const [id, n] of dropsFor(blockId)) this.dropItem(id, n, x + 0.5, y + 0.3, z + 0.5);
  }

  // ------------------------------------------------------------------ combat

  /** Nearest mob hit by a ray within maxDist, or null. */
  raycastMob(o, d, maxDist) {
    let best = null;
    for (const m of this.mobs) {
      const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z,
        m.pos.x - m.hw, m.pos.y, m.pos.z - m.hw, m.pos.x + m.hw, m.pos.y + m.h, m.pos.z + m.hw);
      if (t >= 0 && t <= maxDist && (!best || t < best.t)) best = { mob: m, t };
    }
    return best;
  }

  hurtMob(m, amount, from) {
    if (m.hp <= 0) return;
    m.hp -= amount;
    m.hurtT = 0.35;
    if (from) {
      _v.set(m.pos.x - from.x, 0, m.pos.z - from.z).normalize();
      m.vel.x += _v.x * 7;
      m.vel.z += _v.z * 7;
      m.vel.y = 5;
    }
    if (!m.def.hostile) m.fleeT = 5;
    if (m.hp <= 0) this._killMob(m);
  }

  _killMob(m) {
    const g = this.game;
    g.gfx.particles.burst(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z, 0xdddddd, 0x888888, 20);
    if (g.mode === 'survival') {
      for (const [id, min, max] of m.def.drops) {
        const n = randInt(min, max);
        if (n > 0) this.dropItem(id, n, m.pos.x, m.pos.y + 0.5, m.pos.z);
      }
    }
    m.dead = true;
  }

  _hitPlayer(amount, from) {
    const g = this.game;
    if (g.mode !== 'survival') return;
    g.player.damage(amount, g.time);
    if (from) {
      _v.set(g.player.pos.x - from.x, 0, g.player.pos.z - from.z).normalize();
      g.player.vel.x += _v.x * 6;
      g.player.vel.z += _v.z * 6;
      g.player.vel.y = Math.max(g.player.vel.y, 4.5);
    }
  }

  shootArrow(owner, from, dir, speed, damage) {
    this.arrows.push({ owner, pos: from.clone(), vel: dir.clone().multiplyScalar(speed), age: 0, stuck: false, damage });
  }

  /** Blows up blocks and hurts everything nearby. */
  explode(x, y, z, power = 3) {
    const g = this.game;
    const w = this.world;
    const r = power;
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > r + 0.3 - Math.random() * 0.8) continue;
          const bx = Math.floor(x) + dx;
          const by = Math.floor(y) + dy;
          const bz = Math.floor(z) + dz;
          const id = w.getBlock(bx, by, bz);
          if (id === B.AIR || id === B.BEDROCK || FLUID[id]) continue;
          if (id === B.KEG) {
            w.setBlock(bx, by, bz, B.AIR);
            this.kegs.push({ pos: new THREE.Vector3(bx + 0.5, by, bz + 0.5), t: 0.4 + Math.random() * 0.4, vel: new THREE.Vector3() });
            continue;
          }
          w.setBlock(bx, by, bz, B.AIR);
          if (g.mode === 'survival' && Math.random() < 0.3) this.dropBlock(id, bx, by, bz);
        }
      }
    }
    g.gfx.particles.burst(x, y + 0.5, z, 0x9a9a9a, 0xff9a3a, 60);
    g.gfx.particles.burst(x, y + 0.5, z, 0x555555, 0xffd070, 40);
    const pd = g.player.pos.distanceTo(_v.set(x, y, z));
    if (pd < r * 2.2) this._hitPlayer(Math.round((1 - pd / (r * 2.2)) * power * 5), { x, z });
    for (const m of this.mobs) {
      const md = m.pos.distanceTo(_v.set(x, y, z));
      if (md < r * 2) this.hurtMob(m, Math.round((1 - md / (r * 2)) * power * 6), { x, z });
    }
    g.shake = Math.max(g.shake || 0, 0.6);
  }

  igniteKeg(x, y, z) {
    this.world.setBlock(x, y, z, B.AIR);
    this.kegs.push({ pos: new THREE.Vector3(x + 0.5, y, z + 0.5), t: 3, vel: new THREE.Vector3(0, 2, 0) });
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    const g = this.game;
    const w = this.world;
    const player = g.player;
    const pp = player.pos;
    const hostileActive = g.mode === 'survival' && g.settings.difficulty !== 'peaceful' && player.health > 0;
    this._trySpawn(dt);

    for (const m of this.mobs) {
      if (m.dead) continue;
      const def = m.def;
      m.age += dt;
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.attackT = Math.max(0, m.attackT - dt);
      m.fleeT = Math.max(0, m.fleeT - dt);
      const chunkReady = w.getChunk(Math.floor(m.pos.x) >> 4, Math.floor(m.pos.z) >> 4);
      const dist = m.pos.distanceTo(pp);
      if (!chunkReady || dist > 110 || (def.hostile && g.settings.difficulty === 'peaceful')) {
        m.dead = true;
        continue;
      }
      const inWater = FLUID[w.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y + m.h * 0.4), Math.floor(m.pos.z))] > 0;

      // Undead burn in the sun.
      if (def.burns && g.gfx.sky.daylight > 0.6 && !inWater) {
        const l = w.lightAt(m.pos.x, m.pos.y + m.h, m.pos.z);
        if (l.sky >= 1) {
          m.burnT += dt;
          if (Math.random() < dt * 12) g.gfx.particles.burst(m.pos.x, m.pos.y + m.h * 0.7, m.pos.z, 0xff8a1a, 0xffd23a, 2);
          if (m.burnT > 1) {
            m.burnT = 0;
            this.hurtMob(m, 2);
            if (m.dead) continue;
          }
        }
      }

      // Decide where to go.
      let tx = null;
      let tz = null;
      let speed = def.speed;
      const dxp = pp.x - m.pos.x;
      const dzp = pp.z - m.pos.z;
      if (def.hostile && hostileActive && dist < 22) {
        const flat = Math.hypot(dxp, dzp) || 1;
        if (def.ranged) {
          const want = dist < 6 ? -1 : dist > 11 ? 1 : 0;
          tx = m.pos.x + (dxp / flat) * want * 3 + (want === 0 ? -dzp / flat * 2 * Math.sin(m.age * 0.7) : 0);
          tz = m.pos.z + (dzp / flat) * want * 3 + (want === 0 ? dxp / flat * 2 * Math.sin(m.age * 0.7) : 0);
          if (m.attackT <= 0 && dist < 16 && this._lineOfSight(m)) {
            m.attackT = 2.2;
            _v.set(m.pos.x, m.pos.y + 1.5, m.pos.z);
            _w.set(pp.x, pp.y + 1.2 + dist * 0.06, pp.z).sub(_v).normalize();
            _w.x += (Math.random() - 0.5) * 0.06;
            _w.z += (Math.random() - 0.5) * 0.06;
            this.shootArrow('mob', _v.clone().addScaledVector(_w, 0.6), _w.normalize(), 22, 3);
          }
        } else if (def.explodes) {
          if (dist < 2.8) {
            m.fuse += dt;
            speed = 0;
            if (m.fuse > 1.5) {
              m.dead = true;
              this.explode(m.pos.x, m.pos.y + 0.5, m.pos.z, 3);
              continue;
            }
          } else {
            m.fuse = Math.max(0, m.fuse - dt);
            tx = pp.x;
            tz = pp.z;
          }
        } else {
          tx = pp.x;
          tz = pp.z;
          if (dist < 1.1 + m.hw && Math.abs(pp.y - m.pos.y) < 1.6 && m.attackT <= 0) {
            m.attackT = 1;
            this._hitPlayer(def.damage, m.pos);
          }
          if (def.jumps && m.onGround && dist < 5 && dist > 2 && Math.random() < dt * 1.5) {
            m.vel.y = 6.5;
            m.vel.x += (dxp / flat) * 4;
            m.vel.z += (dzp / flat) * 4;
          }
        }
        m.target = null;
      } else if (m.fleeT > 0) {
        tx = m.pos.x - dxp;
        tz = m.pos.z - dzp;
        speed *= 1.6;
      } else {
        m.wanderT -= dt;
        if (m.wanderT <= 0) {
          m.wanderT = 3 + Math.random() * 6;
          m.target = Math.random() < 0.35 ? null : { x: m.pos.x + (Math.random() - 0.5) * 16, z: m.pos.z + (Math.random() - 0.5) * 16 };
        }
        if (m.target) {
          tx = m.target.x;
          tz = m.target.z;
          speed *= 0.5;
          if (Math.hypot(tx - m.pos.x, tz - m.pos.z) < 0.6) m.target = null;
        }
      }

      let wantX = 0;
      let wantZ = 0;
      if (tx !== null) {
        const ddx = tx - m.pos.x;
        const ddz = tz - m.pos.z;
        const l = Math.hypot(ddx, ddz);
        if (l > 0.3) {
          wantX = (ddx / l) * speed;
          wantZ = (ddz / l) * speed;
          const targetYaw = Math.atan2(ddx, ddz);
          let dy = targetYaw - m.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          m.yaw += dy * Math.min(1, dt * 8);
        }
      } else if (def.hostile && dist < 22) {
        m.yaw = Math.atan2(dxp, dzp);
      }
      const k = 1 - Math.exp(-(m.onGround ? 10 : 2) * dt);
      m.vel.x += (wantX - m.vel.x) * k;
      m.vel.z += (wantZ - m.vel.z) * k;
      if (inWater) {
        m.vel.y = Math.min(m.vel.y + 18 * dt, 2.5);
        m.vel.multiplyScalar(Math.exp(-1.5 * dt));
      } else {
        m.vel.y = Math.max(m.vel.y - 26 * dt, -40);
      }
      const blocked = moveBody(w, m, dt);
      if (blocked && m.onGround && (wantX || wantZ)) m.vel.y = 7.6;
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.speedNow = hs;
      m.walk += dt * hs * 3.2;
      if (m.pos.y < -20) m.dead = true;
    }
    this.mobs = this.mobs.filter((m) => !m.dead);

    this._updateItems(dt);
    this._updateArrows(dt);
    this._updateKegs(dt);
  }

  _lineOfSight(m) {
    const pp = this.game.player.pos;
    _v.set(m.pos.x, m.pos.y + m.h * 0.85, m.pos.z);
    _w.set(pp.x, pp.y + 1.5, pp.z).sub(_v);
    const len = _w.length();
    _w.divideScalar(len);
    const hit = raycast((x, y, z) => this.world.getBlock(x, y, z), _v.x, _v.y, _v.z, _w.x, _w.y, _w.z, len, (id) => OPAQUE[id] === 1);
    return !hit;
  }

  _updateItems(dt) {
    const g = this.game;
    const w = this.world;
    const pp = g.player.pos;
    const canPick = g.mode === 'survival' && g.player.health > 0;
    for (const it of this.items) {
      it.age += dt;
      it.pickupDelay -= dt;
      if (it.age > 300) {
        it.dead = true;
        continue;
      }
      const inWater = FLUID[w.getBlock(Math.floor(it.pos.x), Math.floor(it.pos.y + 0.1), Math.floor(it.pos.z))] > 0;
      const dx = pp.x - it.pos.x;
      const dy = pp.y + 0.8 - it.pos.y;
      const dz = pp.z - it.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (canPick && it.pickupDelay <= 0 && d < 3 && g.inventory.hasRoomFor(it.id)) {
        if (d < 1.1) {
          const left = g.inventory.add(it.id, it.count, it.dur);
          if (left < it.count) g.onPickup(it.id, it.count - left);
          it.count = left;
          if (left <= 0) {
            it.dead = true;
            continue;
          }
        }
        it.vel.x += (dx / d) * 30 * dt;
        it.vel.y += (dy / d) * 30 * dt;
        it.vel.z += (dz / d) * 30 * dt;
      }
      if (inWater) it.vel.y = Math.min(it.vel.y + 14 * dt, 1.2);
      else it.vel.y -= 18 * dt;
      moveBody(w, it, dt);
      if (it.onGround) {
        it.vel.x *= Math.exp(-8 * dt);
        it.vel.z *= Math.exp(-8 * dt);
      }
      if (it.pos.y < -20) it.dead = true;
    }
    // Merge nearby identical stacks now and then.
    this.mergeTimer += dt;
    if (this.mergeTimer > 1) {
      this.mergeTimer = 0;
      for (let i = 0; i < this.items.length; i++) {
        const a = this.items[i];
        if (a.dead || a.dur !== undefined) continue;
        for (let j = i + 1; j < this.items.length; j++) {
          const b = this.items[j];
          if (b.dead || b.id !== a.id || b.dur !== undefined) continue;
          if (a.pos.distanceTo(b.pos) < 1 && a.count + b.count <= (itemDef(a.id).stack || 64)) {
            a.count += b.count;
            b.dead = true;
          }
        }
      }
    }
    this.items = this.items.filter((i) => !i.dead);
  }

  _updateArrows(dt) {
    const g = this.game;
    const w = this.world;
    for (const a of this.arrows) {
      a.age += dt;
      if (a.stuck) {
        if (a.age > 12) a.dead = true;
        continue;
      }
      a.vel.y -= 16 * dt;
      const steps = Math.max(1, Math.ceil((a.vel.length() * dt) / 0.25));
      const h = dt / steps;
      for (let s = 0; s < steps && !a.dead && !a.stuck; s++) {
        a.pos.addScaledVector(a.vel, h);
        if (SOLID[w.getBlock(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z))]) {
          a.stuck = true;
          a.age = 0;
          break;
        }
        if (a.owner === 'mob') {
          const p = g.player.pos;
          if (Math.abs(a.pos.x - p.x) < 0.4 && Math.abs(a.pos.z - p.z) < 0.4 && a.pos.y > p.y && a.pos.y < p.y + 1.8) {
            this._hitPlayer(a.damage, { x: a.pos.x - a.vel.x, z: a.pos.z - a.vel.z });
            a.dead = true;
          }
        } else {
          for (const m of this.mobs) {
            if (Math.abs(a.pos.x - m.pos.x) < m.hw + 0.1 && Math.abs(a.pos.z - m.pos.z) < m.hw + 0.1 && a.pos.y > m.pos.y && a.pos.y < m.pos.y + m.h) {
              this.hurtMob(m, Math.round(a.damage), { x: a.pos.x - a.vel.x, z: a.pos.z - a.vel.z });
              a.dead = true;
              break;
            }
          }
        }
      }
      if (a.age > 20 || a.pos.y < -10) a.dead = true;
    }
    this.arrows = this.arrows.filter((a) => !a.dead);
  }

  _updateKegs(dt) {
    for (const k of this.kegs) {
      k.t -= dt;
      k.vel.y -= 20 * dt;
      k.pos.y += k.vel.y * dt;
      if (SOLID[this.world.getBlock(Math.floor(k.pos.x), Math.floor(k.pos.y), Math.floor(k.pos.z))]) {
        k.pos.y = Math.floor(k.pos.y) + 1;
        k.vel.y = 0;
      }
      if (k.t <= 0) {
        k.dead = true;
        this.explode(k.pos.x, k.pos.y, k.pos.z, 4);
      }
    }
    this.kegs = this.kegs.filter((k) => !k.dead);
  }

  // ------------------------------------------------------------------ rendering

  render(spheres, time) {
    const w = this.world;
    spheres.begin();
    for (const m of this.mobs) {
      const l = w.lightAt(m.pos.x, m.pos.y + m.h * 0.6, m.pos.z);
      _qYaw.setFromAxisAngle(Y, m.yaw);
      const swing = Math.sin(m.walk) * 0.7 * Math.min(1, m.speedNow / 1.5);
      const flash = m.hurtT > 0 ? 1 : 0;
      const fuseGlow = m.fuse > 0 ? (Math.sin(m.fuse * 20) * 0.5 + 0.5) * Math.min(1, m.fuse) : 0;
      for (const part of m.def.parts) {
        _v.set(part.p[0], part.p[1], part.p[2]);
        _qPart.identity();
        if (part.spiderLeg !== undefined) {
          const a = (part.leg === 0 ? 1 : -1) * swing * 0.5;
          _qPart.setFromEuler(_e.set(0, a, part.rz || 0));
        } else if (part.leg !== undefined) {
          const a = (part.leg === 0 ? 1 : -1) * swing;
          _qPart.setFromAxisAngle(_w.set(1, 0, 0), a);
          const py = part.pivot;
          _v.y -= py;
          _v.applyQuaternion(_qPart);
          _v.y += py;
        } else if (part.arm !== undefined) {
          const a = Math.sin(m.age * 2 + part.arm) * 0.08 - (m.attackT > 0.7 ? 0.5 : 0);
          _qPart.setFromAxisAngle(_w.set(1, 0, 0), a);
        } else if (part.head) {
          _v.y += Math.sin(m.age * 1.3 + m.seed * 6) * 0.015;
        }
        _v.applyQuaternion(_qYaw).add(m.pos);
        _q.copy(_qYaw).multiply(_qPart);
        const col = fuseGlow > 0 ? linearColor(part.color).clone().lerp(WHITE, fuseGlow * 0.7) : linearColor(part.color);
        spheres.push(_v.x, _v.y, _v.z, part.s[0], part.s[1], part.s[2], _q, col, -1, part.pattern, part.gloss,
          part.emissive + fuseGlow * 0.8, l.sky, l.torch, flash, m.seed);
      }
    }
    for (const it of this.items) {
      const l = w.lightAt(it.pos.x, it.pos.y + 0.3, it.pos.z);
      const parts = itemModel(it.id);
      const isBlock = parts.length === 1 && parts[0].type >= 0;
      const k = isBlock ? 0.26 : 0.42;
      _qYaw.setFromAxisAngle(Y, time * 1.6 + it.spin);
      const bob = 0.15 + Math.sin(time * 2.5 + it.spin) * 0.06;
      const copies = it.count > 1 ? 2 : 1;
      for (let c = 0; c < copies; c++) {
        for (const pt of parts) {
          _v.set(pt.p[0] * k + c * 0.1, pt.p[1] * k + bob + k * 0.5 + c * 0.05, pt.p[2] * k + c * 0.06).applyQuaternion(_qYaw).add(it.pos);
          spheres.push(_v.x, _v.y, _v.z, pt.s[0] * k, pt.s[1] * k, pt.s[2] * k, _qYaw, linearColor(pt.color), pt.type, pt.pattern, pt.gloss, pt.emissive, l.sky, l.torch, 0, 0.3);
        }
      }
    }
    for (const a of this.arrows) {
      const l = w.lightAt(a.pos.x, a.pos.y, a.pos.z);
      const dir = _w.copy(a.vel).normalize();
      if (dir.lengthSq() < 0.5) dir.set(0, 0, 1);
      if (a.stuck) dir.copy(a.lastDir || Z);
      else a.lastDir = dir.clone();
      _q.setFromUnitVectors(Z, dir);
      spheres.push(a.pos.x - dir.x * 0.3, a.pos.y - dir.y * 0.3, a.pos.z - dir.z * 0.3, 0.025, 0.025, 0.35, _q, linearColor(0x8a6038), -1, 0, 0.3, 0, l.sky, l.torch);
      spheres.push(a.pos.x - dir.x * 0.6, a.pos.y - dir.y * 0.6, a.pos.z - dir.z * 0.6, 0.06, 0.06, 0.08, _q, linearColor(0xf2f2f2), -1, 0, 0.2, 0, l.sky, l.torch);
    }
    for (const k of this.kegs) {
      const l = w.lightAt(k.pos.x, k.pos.y + 0.5, k.pos.z);
      const flashOn = Math.sin(k.t * (k.t < 1 ? 30 : 10)) > 0 ? 1 : 0;
      const s = 0.5 + (k.t < 0.5 ? (0.5 - k.t) * 0.3 : 0);
      spheres.push(k.pos.x, k.pos.y + 0.5, k.pos.z, s, s, s, null, WHITE, B.KEG, 0, 0.3, flashOn * 1.2, l.sky, l.torch);
    }
    spheres.end();
  }
}

export { BLOCKS };
