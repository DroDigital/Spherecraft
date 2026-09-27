// First-person player: movement, collisions (against block cubes), swimming, flying,
// fall damage and health.

import * as THREE from 'three';
import { PLAYER, HEIGHT } from '../config.js';
import { SOLID, FLUID } from '../blocks.js';

const HW = PLAYER.halfWidth;
const PH = PLAYER.height;
const EPS = 1e-4;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.headInWater = false;
    this.sneaking = false;
    this.sprinting = false;
    this.health = PLAYER.maxHealth;
    this.fallPeak = null;
    this.lastDamage = -100;
    this.regenTimer = 0;
    this.walkTime = 0;
    this.autoJump = false;
    this.invulnerable = false; // creative mode
    this.naturalRegen = true; // survival mode regenerates through hunger instead
    this.onDamage = null; // (amount) => void
    this.onLand = null; // (fallDistance) => void
  }

  get eyeHeight() {
    return PLAYER.eye - (this.sneaking && !this.flying ? 0.15 : 0);
  }

  eye(out) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  lookDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.pitch - dy));
  }

  setPosition(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.fallPeak = null;
  }

  /** Does the player's box overlap block (x, y, z)? */
  intersectsBlock(x, y, z) {
    const p = this.pos;
    return (
      p.x + HW > x && p.x - HW < x + 1 &&
      p.y + PH > y && p.y < y + 1 &&
      p.z + HW > z && p.z - HW < z + 1
    );
  }

  _solid(x, y, z) {
    return SOLID[this.world.getBlock(x, y, z)] === 1;
  }

  _moveAxis(axis, delta) {
    if (delta === 0) return false;
    const p = this.pos;
    p[axis] += delta;
    const x0 = Math.floor(p.x - HW), x1 = Math.floor(p.x + HW - EPS);
    const y0 = Math.floor(p.y), y1 = Math.floor(p.y + PH - EPS);
    const z0 = Math.floor(p.z - HW), z1 = Math.floor(p.z + HW - EPS);
    let hit = false;
    let limit = delta > 0 ? Infinity : -Infinity;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!this._solid(x, y, z)) continue;
          hit = true;
          if (axis === 'x') limit = delta > 0 ? Math.min(limit, x - HW - EPS) : Math.max(limit, x + 1 + HW + EPS);
          else if (axis === 'y') limit = delta > 0 ? Math.min(limit, y - PH - EPS) : Math.max(limit, y + 1);
          else limit = delta > 0 ? Math.min(limit, z - HW - EPS) : Math.max(limit, z + 1 + HW + EPS);
        }
      }
    }
    if (hit) p[axis] = limit;
    return hit;
  }

  _groundBelow(x, z) {
    const y = Math.floor(this.pos.y - 0.05);
    const x0 = Math.floor(x - HW), x1 = Math.floor(x + HW - EPS);
    const z0 = Math.floor(z - HW), z1 = Math.floor(z + HW - EPS);
    for (let zz = z0; zz <= z1; zz++) {
      for (let xx = x0; xx <= x1; xx++) if (this._solid(xx, y, zz)) return true;
    }
    return false;
  }

  damage(amount, now) {
    if (amount <= 0 || this.health <= 0 || this.invulnerable) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamage = now;
    this.regenTimer = 0;
    if (this.onDamage) this.onDamage(amount);
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vel.y = 0;
    this.fallPeak = null;
  }

  update(dt, input, now) {
    const w = this.world;
    const p = this.pos;
    const feet = w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
    const waist = w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.8), Math.floor(p.z));
    const wasInWater = this.inWater;
    this.inWater = FLUID[feet] > 0 || FLUID[waist] > 0;
    this.headInWater = FLUID[w.getBlock(Math.floor(p.x), Math.floor(p.y + this.eyeHeight), Math.floor(p.z))] > 0;
    this.enteredWater = this.inWater && !wasInWater;
    this.sneaking = !!input.sneak;
    this.sprinting = !!input.sprint && input.forward > 0 && !this.sneaking && !this.tooHungryToSprint;

    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    let wx = -sy * input.forward + cy * input.strafe;
    let wz = -cy * input.forward - sy * input.strafe;
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }

    const v = this.vel;
    if (this.flying) {
      const speed = this.sprinting ? 22 : 11;
      const k = 1 - Math.exp(-10 * dt);
      v.x += (wx * speed - v.x) * k;
      v.z += (wz * speed - v.z) * k;
      const up = (input.jump ? 1 : 0) - (input.sneak ? 1 : 0);
      v.y += (up * 9 - v.y) * k;
    } else if (this.inWater) {
      const speed = this.sprinting ? 3.8 : 2.7;
      const k = 1 - Math.exp(-7 * dt);
      v.x += (wx * speed - v.x) * k;
      v.z += (wz * speed - v.z) * k;
      v.y -= 9 * dt;
      v.y *= Math.exp(-2.2 * dt);
      if (input.jump) v.y = Math.min(v.y + 26 * dt, 3.6);
      if (input.sneak) v.y = Math.max(v.y - 20 * dt, -4);
    } else {
      const speed = this.sneaking ? 1.6 : this.sprinting ? 5.8 : 4.3;
      const k = 1 - Math.exp(-(this.onGround ? 16 : 3.2) * dt);
      v.x += (wx * speed - v.x) * k;
      v.z += (wz * speed - v.z) * k;
      v.y = Math.max(v.y - 28 * dt, -60);
      if (input.jump && this.onGround) v.y = 8.4;
    }

    // Integrate with sub-steps so fast movement can't tunnel through blocks.
    const maxMove = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
    const steps = Math.max(1, Math.ceil(maxMove / 0.4));
    const h = dt / steps;
    const wasOnGround = this.onGround;
    let blockedH = false;
    this.onGround = false;
    for (let s = 0; s < steps; s++) {
      if (this._moveAxis('y', v.y * h)) {
        if (v.y < 0) this.onGround = true;
        v.y = 0;
      }
      const sneakGuard = this.sneaking && wasOnGround && !this.flying && !this.inWater;
      const ox = p.x;
      if (this._moveAxis('x', v.x * h)) { v.x = 0; blockedH = true; }
      if (sneakGuard && !this._groundBelow(p.x, p.z)) { p.x = ox; v.x = 0; }
      const oz = p.z;
      if (this._moveAxis('z', v.z * h)) { v.z = 0; blockedH = true; }
      if (sneakGuard && !this._groundBelow(p.x, p.z)) { p.z = oz; v.z = 0; }
    }

    // Swim out of water onto a ledge / auto-jump onto single steps.
    if (blockedH && len > 0.1 && !this.flying) {
      const fx = Math.floor(p.x + wx * 0.6);
      const fz = Math.floor(p.z + wz * 0.6);
      const fy = Math.floor(p.y + 0.01);
      const step = this._solid(fx, fy, fz) && !this._solid(fx, fy + 1, fz) && !this._solid(fx, fy + 2, fz);
      if (step && this.inWater && input.jump) v.y = 6.5;
      else if (step && this.autoJump && this.onGround) v.y = 8.4;
    }

    if (this.flying && this.onGround) this.flying = false;
    if (p.y > HEIGHT + 60) {
      p.y = HEIGHT + 60;
      v.y = Math.min(v.y, 0);
    }

    // Fall damage.
    if (this.flying || this.inWater) {
      this.fallPeak = null;
    } else if (this.onGround) {
      if (this.fallPeak !== null) {
        const dist = this.fallPeak - p.y;
        if (dist > 3.5) this.damage(Math.floor(dist - 3), now);
        if (this.onLand) this.onLand(dist);
      }
      this.fallPeak = null;
    } else {
      this.fallPeak = this.fallPeak === null ? p.y : Math.max(this.fallPeak, p.y);
    }
    if (p.y < -30) this.damage(this.health, now);

    // Regeneration.
    if (this.naturalRegen && this.health > 0 && this.health < PLAYER.maxHealth && now - this.lastDamage > 4) {
      this.regenTimer += dt;
      if (this.regenTimer > 2) {
        this.regenTimer = 0;
        this.health = Math.min(PLAYER.maxHealth, this.health + 1);
      }
    }

    const hspeed = Math.hypot(v.x, v.z);
    if (this.onGround && hspeed > 0.5) this.walkTime += dt * hspeed;
    return { walking: this.onGround && hspeed > 0.5 };
  }
}
