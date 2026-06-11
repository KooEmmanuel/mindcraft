// First-person player: AABB voxel collision, gravity, jumping, swimming, fly mode.
import * as THREE from 'three';
import { WATER } from './blocks.js';

const WIDTH = 0.6, HEIGHT_P = 1.8, EYE = 1.62;
const GRAVITY = 24, JUMP = 8.6, SPEED = 5.4, SPRINT = 8.4, FLY_SPEED = 14;

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.pos = new THREE.Vector3(spawn.x, spawn.y, spawn.z); // feet position
    this.vel = new THREE.Vector3();
    this.yaw = -Math.PI * 0.25;
    this.pitch = -0.1;
    this.onGround = false;
    this.fly = false;
    this.inWater = false;
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  // Does the player's AABB overlap block cell (x,y,z)?
  overlapsBlock(x, y, z) {
    const hw = WIDTH / 2;
    return (
      x + 1 > this.pos.x - hw && x < this.pos.x + hw &&
      z + 1 > this.pos.z - hw && z < this.pos.z + hw &&
      y + 1 > this.pos.y && y < this.pos.y + HEIGHT_P
    );
  }

  collides() {
    const hw = WIDTH / 2;
    const minX = Math.floor(this.pos.x - hw), maxX = Math.floor(this.pos.x + hw);
    const minY = Math.floor(this.pos.y), maxY = Math.floor(this.pos.y + HEIGHT_P - 0.001);
    const minZ = Math.floor(this.pos.z - hw), maxZ = Math.floor(this.pos.z + hw);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (this.world.isSolid(x, y, z)) return true;
    return false;
  }

  update(dt, input) {
    const world = this.world;

    // Self-rescue: if we ever end up inside a block (kart exit, edge cases),
    // pop upward to the nearest free space instead of freezing forever.
    if (this.collides()) {
      const startY = this.pos.y;
      let freed = false;
      for (let up = 0.25; up <= 3.5; up += 0.25) {
        this.pos.y = startY + up;
        if (!this.collides()) { freed = true; break; }
      }
      if (!freed) {
        this.pos.y = world.surfaceHeight(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 1.01;
      }
      this.vel.set(0, Math.max(0, this.vel.y), 0);
    }
    const headBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    const feetBlock = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z));
    this.inWater = headBlock === WATER;
    const swimming = feetBlock === WATER;

    // Desired horizontal movement in look space
    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const speed = this.fly ? FLY_SPEED : (input.sprint ? SPRINT : SPEED) * (swimming ? 0.55 : 1);
    // forward = (sin, cos); right = (-cos, sin) in this yaw convention
    const dx = (mz * sin - mx * cos) * speed;
    const dz = (mz * cos + mx * sin) * speed;

    if (this.fly) {
      this.vel.x = dx; this.vel.z = dz;
      this.vel.y = (input.jump ? FLY_SPEED : 0) + (input.down ? -FLY_SPEED : 0);
    } else {
      // Smooth horizontal control
      const accel = this.onGround ? 14 : 6;
      this.vel.x += (dx - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (dz - this.vel.z) * Math.min(1, accel * dt);

      if (swimming) {
        this.vel.y -= GRAVITY * 0.25 * dt;
        this.vel.y = Math.max(this.vel.y, -3.2);
        if (input.jump) this.vel.y = 4.2;
      } else {
        this.vel.y -= GRAVITY * dt;
        this.vel.y = Math.max(this.vel.y, -42);
        if (input.jump && this.onGround) { this.vel.y = JUMP; this.onGround = false; }
      }
    }

    // Move and collide, axis by axis
    this.onGround = false;

    this.pos.x += this.vel.x * dt;
    if (this.collides()) {
      this.pos.x -= this.vel.x * dt;
      this.vel.x = 0;
    }

    this.pos.z += this.vel.z * dt;
    if (this.collides()) {
      this.pos.z -= this.vel.z * dt;
      this.vel.z = 0;
    }

    this.pos.y += this.vel.y * dt;
    if (this.collides()) {
      if (this.vel.y < 0) this.onGround = true;
      // Snap out along Y
      this.pos.y -= this.vel.y * dt;
      this.vel.y = 0;
    }

    // Safety net: never fall through the world
    if (this.pos.y < -10) {
      this.pos.y = 80;
      this.vel.set(0, 0, 0);
    }
  }

  applyCamera(camera) {
    const eye = this.eyePos();
    camera.position.copy(eye);
    const dir = this.lookDir();
    camera.lookAt(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z);
  }
}
