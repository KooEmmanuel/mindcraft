// Floating golden tokens to collect — spin, bob, chime, respawn elsewhere.
import * as THREE from 'three';
import { WATER_Y } from './world.js';

const COUNT = 36, RADIUS = 130;

export class Collectibles {
  constructor(scene, world, originX, originZ) {
    this.world = world;
    this.origin = { x: originX, z: originZ };
    this.tokens = [];

    const geo = new THREE.OctahedronGeometry(0.26);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd45e, emissive: 0xa07010 });

    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const token = { mesh, baseY: 0, bobOffset: Math.random() * Math.PI * 2 };
      this.place(token);
      scene.add(mesh);
      this.tokens.push(token);
    }
  }

  place(token) {
    for (let tries = 0; tries < 50; tries++) {
      const x = this.origin.x + Math.floor((Math.random() - 0.5) * RADIUS * 2);
      const z = this.origin.z + Math.floor((Math.random() - 0.5) * RADIUS * 2);
      const h = this.world.surfaceHeight(x, z);
      if (h <= WATER_Y) continue; // not over water
      token.baseY = h + 1.5;
      token.mesh.position.set(x + 0.5, token.baseY, z + 0.5);
      return;
    }
  }

  update(dt, time, playerPos, onPickup) {
    for (const token of this.tokens) {
      token.mesh.rotation.y += dt * 2.4;
      token.mesh.position.y = token.baseY + Math.sin(time * 2 + token.bobOffset) * 0.16;

      const d = token.mesh.position.distanceTo(playerPos);
      if (d < 1.4) {
        onPickup();
        this.place(token); // respawn somewhere new — infinite treasure hunt
      }
    }
  }
}
