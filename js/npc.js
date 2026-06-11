// Wandering villager NPCs: walk, hop ledges, avoid water/cliffs, wave at the player.
import * as THREE from 'three';
import { buildCharacter, NPC_PALETTES } from './character.js';
import { WATER } from './blocks.js';
import { WATER_Y } from './world.js';

const GRAVITY = 24, WALK = 1.7, JUMP = 8.2;
const HALF_W = 0.24, NPC_H = 1.7;

class NPC {
  constructor(world, scene, x, z, palette) {
    this.world = world;
    this.char = buildCharacter(palette);
    scene.add(this.char.group);
    this.pos = new THREE.Vector3(x + 0.5, world.surfaceHeight(x, z) + 1, z + 0.5);
    this.velY = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 3;
    this.waveCooldown = 0;
  }

  collides(px, py, pz) {
    const w = this.world;
    for (const [ox, oz] of [[-HALF_W, -HALF_W], [HALF_W, -HALF_W], [-HALF_W, HALF_W], [HALF_W, HALF_W]]) {
      for (const oy of [0.05, 0.9, NPC_H - 0.1]) {
        if (w.isSolid(Math.floor(px + ox), Math.floor(py + oy), Math.floor(pz + oz))) return true;
      }
    }
    return false;
  }

  hasData() {
    const cx = Math.floor(this.pos.x / 16), cz = Math.floor(this.pos.z / 16);
    const chunk = this.world.chunks.get(this.world.key(cx, cz));
    return !!(chunk && chunk.data);
  }

  update(dt, playerPos) {
    if (!this.hasData()) return; // wait until terrain is loaded under us

    this.timer -= dt;
    this.waveCooldown -= dt;
    const toPlayer = playerPos ? Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z) : 999;

    // Greet a nearby player
    if (toPlayer < 4.5 && this.waveCooldown <= 0) {
      this.state = 'greet';
      this.timer = 2.2;
      this.waveCooldown = 14 + Math.random() * 10;
      this.char.setWave(2.0);
    }

    if (this.timer <= 0) {
      if (this.state === 'walk' || this.state === 'greet') {
        this.state = 'idle';
        this.timer = 1.5 + Math.random() * 3.5;
      } else {
        this.state = 'walk';
        this.yaw = Math.random() * Math.PI * 2;
        this.timer = 2 + Math.random() * 4;
      }
    }

    let walking = 0;
    if (this.state === 'greet' && playerPos) {
      // face the player
      this.yaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    } else if (this.state === 'walk') {
      walking = 1;
      const dirX = Math.sin(this.yaw), dirZ = Math.cos(this.yaw);

      // Look one block ahead at feet level
      const aheadX = Math.floor(this.pos.x + dirX * 0.8);
      const aheadZ = Math.floor(this.pos.z + dirZ * 0.8);
      const feetY = Math.floor(this.pos.y);
      const blockAhead = this.world.isSolid(aheadX, feetY, aheadZ);
      const blockAheadUp = this.world.isSolid(aheadX, feetY + 1, aheadZ);
      const waterAhead = this.world.getBlock(aheadX, feetY, aheadZ) === WATER ||
                         this.world.getBlock(aheadX, feetY - 1, aheadZ) === WATER;
      // Cliff: nothing solid for 3 blocks below the next step
      const cliffAhead = !blockAhead &&
        !this.world.isSolid(aheadX, feetY - 1, aheadZ) &&
        !this.world.isSolid(aheadX, feetY - 2, aheadZ) &&
        !this.world.isSolid(aheadX, feetY - 3, aheadZ);

      if (waterAhead || cliffAhead || (blockAhead && blockAheadUp)) {
        this.yaw += Math.PI * (0.5 + Math.random()); // turn away
      } else if (blockAhead && !blockAheadUp && this.onGround) {
        this.velY = JUMP * 0.78; // hop the ledge
        this.onGround = false;
      }

      // Move with per-axis collision
      const nx = this.pos.x + dirX * WALK * dt;
      if (!this.collides(nx, this.pos.y, this.pos.z)) this.pos.x = nx;
      const nz = this.pos.z + dirZ * WALK * dt;
      if (!this.collides(this.pos.x, this.pos.y, nz)) this.pos.z = nz;
    }

    // Gravity
    this.velY -= GRAVITY * dt;
    this.velY = Math.max(this.velY, -40);
    const ny = this.pos.y + this.velY * dt;
    if (this.collides(this.pos.x, ny, this.pos.z)) {
      if (this.velY < 0) this.onGround = true;
      this.velY = 0;
    } else {
      this.pos.y = ny;
      if (this.velY < -0.1) this.onGround = false;
    }
    if (this.pos.y < -10) this.pos.y = this.world.surfaceHeight(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 2;

    // Apply to model
    this.char.group.position.copy(this.pos);
    this.char.group.rotation.y = this.yaw;
    this.char.animate(dt, walking);
  }
}

export class NPCs {
  constructor(scene, world, originX, originZ, count = 7) {
    this.list = [];
    let attempts = 0;
    while (this.list.length < count && attempts < 300) {
      attempts++;
      const x = originX + Math.floor((Math.random() - 0.5) * 70);
      const z = originZ + Math.floor((Math.random() - 0.5) * 70);
      if (world.surfaceHeight(x, z) <= WATER_Y + 1) continue; // no spawning in lakes
      if (world.treeAt(x, z)) continue;                            // not inside a tree trunk
      const palette = NPC_PALETTES[this.list.length % NPC_PALETTES.length];
      this.list.push(new NPC(world, scene, x, z, palette));
    }
  }

  update(dt, playerPos) {
    for (const npc of this.list) npc.update(dt, playerPos);
  }
}
