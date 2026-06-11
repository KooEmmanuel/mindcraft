// Race mode: a loop of golden gates around spawn — beat the clock, save your best.
import * as THREE from 'three';
import { WATER_Y } from './world.js';

const GATE_COUNT = 8, RADIUS = 42, PASS_DIST = 3.2;

export class Race {
  constructor(scene, world, originX, originZ) {
    this.gates = [];
    this.running = false;
    this.index = 0;
    this.startTime = 0;

    const ringGeo = new THREE.TorusGeometry(2.1, 0.22, 8, 24);
    for (let i = 0; i < GATE_COUNT; i++) {
      const angle = (i / GATE_COUNT) * Math.PI * 2;
      // Walk the radius in/out until the gate stands over land
      let r = RADIUS, x = 0, z = 0;
      for (const tryR of [RADIUS, RADIUS - 6, RADIUS + 6, RADIUS - 12, RADIUS + 12, RADIUS - 18]) {
        x = originX + Math.cos(angle) * tryR;
        z = originZ + Math.sin(angle) * tryR;
        r = tryR;
        if (world.surfaceHeight(Math.floor(x), Math.floor(z)) > WATER_Y) break;
      }
      const y = world.surfaceHeight(Math.floor(x), Math.floor(z)) + 2.6;
      const mat = new THREE.MeshLambertMaterial({ color: 0xffd45e, emissive: 0x553300, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.set(x, y, z);
      // Face the direction of travel (toward the next gate around the circle)
      mesh.lookAt(
        originX + Math.cos(angle + 0.3) * RADIUS,
        y,
        originZ + Math.sin(angle + 0.3) * RADIUS
      );
      mesh.visible = false;
      scene.add(mesh);
      this.gates.push({ mesh, mat });
    }
  }

  start() {
    this.running = true;
    this.index = 0;
    this.startTime = performance.now();
    for (const g of this.gates) {
      g.mesh.visible = true;
      g.mat.emissive.setHex(0x553300);
      g.mat.color.setHex(0xffd45e);
    }
    this.highlightCurrent();
  }

  cancel() {
    this.running = false;
    for (const g of this.gates) g.mesh.visible = false;
  }

  highlightCurrent() {
    const g = this.gates[this.index];
    if (g) { g.mat.color.setHex(0x4dff6a); g.mat.emissive.setHex(0x0a5d1f); }
  }

  elapsed() {
    return (performance.now() - this.startTime) / 1000;
  }

  /** Returns 'gate' | 'finish' | null */
  update(playerPos, time) {
    if (!this.running) return null;

    // Pulse the active gate
    const active = this.gates[this.index];
    if (active) {
      const s = 1 + Math.sin(time * 5) * 0.06;
      active.mesh.scale.set(s, s, s);
    }

    if (active && active.mesh.position.distanceTo(playerPos) < PASS_DIST) {
      active.mesh.scale.set(1, 1, 1);
      active.mat.color.setHex(0x666666);
      active.mat.emissive.setHex(0x111111);
      this.index++;
      if (this.index >= this.gates.length) {
        this.running = false;
        const t = this.elapsed();
        const best = parseFloat(localStorage.getItem('mindcraft_best_race') || 'Infinity');
        if (t < best) localStorage.setItem('mindcraft_best_race', t.toFixed(1));
        setTimeout(() => { for (const g of this.gates) g.mesh.visible = false; }, 2500);
        return 'finish';
      }
      this.highlightCurrent();
      return 'gate';
    }
    return null;
  }

  best() {
    const b = localStorage.getItem('mindcraft_best_race');
    return b ? `${b}s` : '—';
  }
}
