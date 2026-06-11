// Glitch slimes: hopping enemies that wander, chase the player, and pop when shot.
import * as THREE from 'three';

const COUNT = 6, CHASE_RANGE = 13, CONTACT_RANGE = 1.3;
const GRAVITY = 24;

function buildSlime() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.7, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x7a3fc4, emissive: 0x2a0f4d })
  );
  body.position.y = 0.35;
  g.add(body);
  for (const ex of [-0.18, 0.18]) {
    const white = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    white.position.set(ex, 0.45, 0.41);
    g.add(white);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    pupil.position.set(ex, 0.45, 0.44);
    g.add(pupil);
  }
  return { group: g, body };
}

class Slime {
  constructor(world, scene, x, z) {
    this.world = world;
    const m = buildSlime();
    this.group = m.group;
    this.body = m.body;
    scene.add(this.group);
    this.pos = new THREE.Vector3(x + 0.5, world.surfaceHeight(x, z) + 1.5, z + 0.5);
    this.velY = 0;
    this.hopX = 0; this.hopZ = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.hopTimer = Math.random();
    this.touchCooldown = 0;
    this.dead = false;
    this.respawnTimer = 0;
    this.squish = 0;
  }

  solidAt(x, y, z) {
    return this.world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  update(dt, playerPos, onTouchPlayer) {
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn(playerPos);
      return;
    }

    this.hopTimer -= dt;
    this.touchCooldown -= dt;
    const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // Hop toward player when near, wander otherwise
    if (this.onGround && this.hopTimer <= 0) {
      this.hopTimer = 0.85 + Math.random() * 0.6;
      if (dist < CHASE_RANGE) this.yaw = Math.atan2(dx, dz);
      else if (Math.random() < 0.4) this.yaw = Math.random() * Math.PI * 2;
      this.velY = 6.2;
      const lunge = dist < CHASE_RANGE ? 3.4 : 2.0;
      this.hopX = Math.sin(this.yaw) * lunge;
      this.hopZ = Math.cos(this.yaw) * lunge;
      this.onGround = false;
    }

    // Horizontal motion only while airborne (slimes hop, don't slide)
    if (!this.onGround) {
      const nx = this.pos.x + this.hopX * dt;
      if (!this.solidAt(nx, this.pos.y + 0.2, this.pos.z)) this.pos.x = nx;
      const nz = this.pos.z + this.hopZ * dt;
      if (!this.solidAt(this.pos.x, this.pos.y + 0.2, nz)) this.pos.z = nz;
    }

    // Gravity
    this.velY -= GRAVITY * dt;
    this.velY = Math.max(this.velY, -38);
    const ny = this.pos.y + this.velY * dt;
    if (this.velY <= 0 && this.solidAt(this.pos.x, ny, this.pos.z)) {
      if (!this.onGround) this.squish = 0.25; // landing squash
      this.velY = 0;
      this.onGround = true;
      this.pos.y = Math.floor(ny) + 1;
    } else if (this.velY > 0 && this.solidAt(this.pos.x, ny + 0.7, this.pos.z)) {
      this.velY = 0;
    } else {
      this.pos.y = ny;
    }
    if (this.pos.y < -10) this.respawn(playerPos);

    // Bump the player
    if (dist < CONTACT_RANGE && Math.abs(playerPos.y - this.pos.y) < 1.6 && this.touchCooldown <= 0) {
      this.touchCooldown = 1.2;
      onTouchPlayer(this, new THREE.Vector3(dx, 0, dz).normalize());
    }

    // Apply to model with squash & stretch
    this.squish = Math.max(0, this.squish - dt * 1.6);
    const stretch = this.onGround ? 1 - this.squish : 1 + Math.min(0.25, Math.abs(this.velY) * 0.02);
    this.body.scale.set(1 + this.squish * 0.6, stretch, 1 + this.squish * 0.6);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  kill() {
    this.dead = true;
    this.respawnTimer = 5 + Math.random() * 5;
    this.group.visible = false;
  }

  respawn(playerPos) {
    let x = Math.floor(playerPos.x + 20), z = Math.floor(playerPos.z + 20);
    for (let tries = 0; tries < 12; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * 18;
      x = Math.floor(playerPos.x + Math.cos(angle) * r);
      z = Math.floor(playerPos.z + Math.sin(angle) * r);
      if (!this.world.treeAt(x, z)) break;
    }
    this.pos.set(x + 0.5, this.world.surfaceHeight(x, z) + 1.5, z + 0.5);
    this.velY = 0;
    this.dead = false;
    this.group.visible = true;
  }
}

export class Enemies {
  constructor(scene, world, originX, originZ) {
    this.list = [];
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      const r = 18 + Math.random() * 22;
      this.list.push(new Slime(world, scene, Math.floor(originX + Math.cos(angle) * r), Math.floor(originZ + Math.sin(angle) * r)));
    }
  }

  update(dt, playerPos, onTouchPlayer) {
    for (const slime of this.list) slime.update(dt, playerPos, onTouchPlayer);
  }

  // Returns the slime hit within radius of point, or null
  hitTest(point, radius = 1.4) {
    for (const slime of this.list) {
      if (!slime.dead && slime.pos.distanceTo(point) < radius) return slime;
    }
    return null;
  }
}
