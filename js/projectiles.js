// Fireballs: arcing projectiles that explode on terrain or enemies.
import * as THREE from 'three';

const SPEED = 24, GRAVITY = 10, LIFE = 2.5;

export class Projectiles {
  constructor(scene, world, particles, sound) {
    this.scene = scene;
    this.world = world;
    this.particles = particles;
    this.sound = sound;
    this.list = [];
    this.geo = new THREE.SphereGeometry(0.3, 8, 8);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xff8c2a, emissive: 0xcc4400 });
  }

  fire(origin, dir) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.list.push({
      mesh,
      vel: dir.clone().multiplyScalar(SPEED).add(new THREE.Vector3(0, 1.2, 0)),
      life: LIFE,
    });
    this.sound.placeSound();
  }

  explode(p) {
    this.particles.burst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0xff8c2a, 22);
    this.sound.breakSound(0.5);
    this.scene.remove(p.mesh);
  }

  update(dt, enemies, onKill) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.vel.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 9;
      const m = p.mesh.position;
      // flame trail
      p.trail = (p.trail || 0) - dt;
      if (p.trail <= 0) {
        p.trail = 0.03;
        this.particles.burst(m.x, m.y, m.z, 0xffaa33, 2);
      }

      let done = false;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        done = true;
      } else if (this.world.isSolid(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z))) {
        this.explode(p);
        done = true;
      } else {
        const slime = enemies.hitTest(m);
        if (slime) {
          this.explode(p);
          this.particles.burst(slime.pos.x, slime.pos.y + 0.5, slime.pos.z, 0x7a3fc4, 26);
          slime.kill();
          onKill();
          done = true;
        }
      }
      if (done) this.list.splice(i, 1);
    }
  }
}
