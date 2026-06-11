// Block-break particles and fully synthesized sounds — no audio files.
import * as THREE from 'three';

const MAX_PARTICLES = 400;

export class Particles {
  constructor(scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.vels = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;

    this.positions.fill(-9999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(x, y, z, colorHex, count = 18) {
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.positions[p * 3] = x + (Math.random() - 0.5) * 0.8;
      this.positions[p * 3 + 1] = y + (Math.random() - 0.5) * 0.8;
      this.positions[p * 3 + 2] = z + (Math.random() - 0.5) * 0.8;
      this.vels[p * 3] = (Math.random() - 0.5) * 4;
      this.vels[p * 3 + 1] = Math.random() * 5 + 1;
      this.vels[p * 3 + 2] = (Math.random() - 0.5) * 4;
      const shade = 0.75 + Math.random() * 0.45;
      this.colors[p * 3] = c.r * shade;
      this.colors[p * 3 + 1] = c.g * shade;
      this.colors[p * 3 + 2] = c.b * shade;
      this.life[p] = 0.7 + Math.random() * 0.4;
    }
  }

  update(dt) {
    for (let p = 0; p < MAX_PARTICLES; p++) {
      if (this.life[p] <= 0) continue;
      this.life[p] -= dt;
      if (this.life[p] <= 0) {
        this.positions[p * 3 + 1] = -9999;
        continue;
      }
      this.vels[p * 3 + 1] -= 14 * dt;
      this.positions[p * 3] += this.vels[p * 3] * dt;
      this.positions[p * 3 + 1] += this.vels[p * 3 + 1] * dt;
      this.positions[p * 3 + 2] += this.vels[p * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Sound {
  constructor() {
    this.ctx = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Short filtered noise burst — block breaking
  breakSound(pitch = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    const dur = 0.12;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 380 * pitch + Math.random() * 120;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  // Two-note ascending chime — token pickup
  pickupSound() {
    const ctx = this.ensure();
    if (!ctx) return;
    [[660, 0], [990, 0.08]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.12, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    });
  }

  // Soft click — block placing
  placeSound() {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }
}
