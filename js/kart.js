// Drivable go-kart: arcade acceleration/steering, terrain following, wall bounces.
import * as THREE from 'three';
import { WATER } from './blocks.js';

const MAX_SPEED = 16, REVERSE_MAX = -6;
const ACCEL = 11, BRAKE = 18, FRICTION = 2.0, STEER = 2.2;
const GRAVITY = 22;

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

function buildKartModel() {
  const g = new THREE.Group(); // faces +z

  const body = box(0.9, 0.22, 1.5, 0xd43b3b);
  body.position.y = 0.34;
  g.add(body);

  const nose = box(0.5, 0.14, 0.35, 0xb02f2f);
  nose.position.set(0, 0.32, 0.85);
  g.add(nose);

  const seatBack = box(0.6, 0.4, 0.12, 0x333333);
  seatBack.position.set(0, 0.62, -0.55);
  g.add(seatBack);

  const wheel = () => box(0.22, 0.34, 0.34, 0x1a1a1a);
  const positions = [[-0.52, 0.55], [0.52, 0.55], [-0.52, -0.55], [0.52, -0.55]];
  const wheels = positions.map(([x, z]) => {
    const w = wheel();
    w.position.set(x, 0.2, z);
    g.add(w);
    return w;
  });

  const pole = box(0.06, 0.4, 0.06, 0x666666);
  pole.position.set(0, 0.58, 0.45);
  pole.rotation.x = -0.5;
  g.add(pole);
  const steeringWheel = box(0.32, 0.22, 0.06, 0x222222);
  steeringWheel.position.set(0, 0.76, 0.36);
  steeringWheel.rotation.x = -0.5;
  g.add(steeringWheel);

  return { group: g, wheels };
}

export class Kart {
  constructor(scene, world, particles) {
    this.world = world;
    this.particles = particles;
    const model = buildKartModel();
    this.group = model.group;
    this.wheels = model.wheels;
    this.group.visible = false;
    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.velY = 0;
    this.onGround = true;
    this.active = false;
    this.dustTimer = 0;
  }

  enter(playerPos, playerYaw) {
    this.pos.set(playerPos.x, playerPos.y, playerPos.z);
    this.yaw = playerYaw;
    this.speed = 0;
    this.velY = 0;
    this.active = true;
    this.group.visible = true;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  exit() {
    this.active = false;
    this.group.visible = false;
  }

  // Highest solid surface at (x,z) near current height — respects player builds & caves
  groundYAt(x, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let y = Math.floor(this.pos.y) + 2; y >= Math.floor(this.pos.y) - 6; y--) {
      if (this.world.isSolid(bx, y, bz)) return y + 1;
    }
    return null; // falling
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt, input) {
    if (!this.active) return;

    // Throttle / brake
    if (input.forward) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (input.back) this.speed = Math.max(REVERSE_MAX, this.speed - BRAKE * dt);
    else this.speed *= Math.max(0, 1 - FRICTION * dt);

    // In water: heavy drag
    const inWater = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z)) === WATER;
    if (inWater) this.speed *= Math.max(0, 1 - 3.5 * dt);

    // Steering scales with speed (no spinning in place)
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const speedFactor = THREE.MathUtils.clamp(this.speed / 6, -1, 1);
    this.yaw += steerInput * STEER * speedFactor * dt;

    // Horizontal move with wall bounce
    const dir = this.forward();
    const nx = this.pos.x + dir.x * this.speed * dt;
    const nz = this.pos.z + dir.z * this.speed * dt;
    const wallAt = (x, z) =>
      this.world.isSolid(Math.floor(x), Math.floor(this.pos.y + 0.5), Math.floor(z)) ||
      this.world.isSolid(Math.floor(x), Math.floor(this.pos.y + 1.4), Math.floor(z));
    const sideX = dir.z * 0.45, sideZ = -dir.x * 0.45;
    const wallWide = (x, z) => wallAt(x, z) || wallAt(x + sideX, z + sideZ) || wallAt(x - sideX, z - sideZ);
    if (wallWide(nx, this.pos.z) || wallWide(nx, nz)) {
      this.speed *= -0.35; // bounce off
    } else {
      this.pos.x = nx;
    }
    if (wallWide(this.pos.x, nz)) {
      this.speed *= -0.35;
    } else {
      this.pos.z = nz;
    }

    // Terrain following / airborne
    const groundY = this.groundYAt(this.pos.x, this.pos.z);
    if (groundY === null || this.pos.y > groundY + 0.3) {
      this.velY -= GRAVITY * dt;
      this.pos.y += this.velY * dt;
      this.onGround = false;
      if (groundY !== null && this.pos.y <= groundY) {
        this.pos.y = groundY;
        this.velY = 0;
        this.onGround = true;
      }
    } else {
      // Smoothly ride the surface (climbs 1-block steps)
      this.pos.y += (groundY - this.pos.y) * Math.min(1, 12 * dt);
      this.velY = 0;
      this.onGround = true;
    }
    if (this.pos.y < -10) { this.pos.y = 80; this.velY = 0; }

    // Drift dust when cornering fast
    this.dustTimer -= dt;
    if (this.onGround && Math.abs(this.speed) > 9 && steerInput !== 0 && this.dustTimer <= 0) {
      this.dustTimer = 0.07;
      this.particles.burst(
        this.pos.x - dir.x * 0.6, this.pos.y + 0.15, this.pos.z - dir.z * 0.6,
        0xcccccc, 4
      );
    }

    // Apply to model
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    // Lean into turns + wheel spin
    this.group.rotation.z = -steerInput * speedFactor * 0.08;
    for (const w of this.wheels) w.rotation.x += this.speed * dt * 2.2;
  }
}
