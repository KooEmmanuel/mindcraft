// Day/night cycle: sun, moon, stars, drifting clouds, dynamic sky + fog colors.
import * as THREE from 'three';

const DAY = new THREE.Color(0x87ceeb);
const SUNSET = new THREE.Color(0xf5a05c);
const NIGHT = new THREE.Color(0x0a0e22);

function discTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.skyColor = new THREE.Color();

    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTexture('rgba(255,240,180,1)', 'rgba(255,200,80,0)'), fog: false, depthWrite: false,
    }));
    this.sun.scale.set(90, 90, 1);
    scene.add(this.sun);

    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTexture('rgba(225,230,255,0.95)', 'rgba(160,170,220,0)'), fog: false, depthWrite: false,
    }));
    this.moon.scale.set(55, 55, 1);
    scene.add(this.moon);

    // Stars
    const starPos = [];
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.05, Math.random() - 0.5).normalize().multiplyScalar(420);
      starPos.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Clouds
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, fog: false });
    for (let i = 0; i < 22; i++) {
      const w = 12 + Math.random() * 26, d = 8 + Math.random() * 18;
      const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), cloudMat);
      cloud.position.set((Math.random() - 0.5) * 500, 86 + Math.random() * 10, (Math.random() - 0.5) * 500);
      this.clouds.add(cloud);
    }
    scene.add(this.clouds);

    // Lights
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    scene.add(this.sunLight);
    this.ambient = new THREE.AmbientLight(0xbfd4ff, 0.5);
    scene.add(this.ambient);
  }

  // t: 0..1 day cycle (0 = sunrise). Returns the sky color so main can match fog.
  update(t, camera, dt) {
    const angle = t * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.25).normalize();
    const sunHeight = sunDir.y; // 1 noon, -1 midnight

    this.sun.position.copy(camera.position).addScaledVector(sunDir, 380);
    this.moon.position.copy(camera.position).addScaledVector(sunDir, -380);
    this.stars.position.copy(camera.position);

    // Sky color: day -> sunset band -> night
    const dayAmount = THREE.MathUtils.clamp(sunHeight * 3, 0, 1);
    const sunsetAmount = THREE.MathUtils.clamp(1 - Math.abs(sunHeight) * 5, 0, 1) * 0.85;
    this.skyColor.copy(NIGHT).lerp(DAY, dayAmount).lerp(SUNSET, sunsetAmount * THREE.MathUtils.clamp(dayAmount + 0.3, 0, 1));

    this.stars.material.opacity = THREE.MathUtils.clamp(-sunHeight * 2.2, 0, 0.95);

    this.sunLight.position.copy(camera.position).addScaledVector(sunDir, 100);
    this.sunLight.target.position.copy(camera.position);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.intensity = THREE.MathUtils.clamp(sunHeight * 1.6, 0.02, 1.05);
    this.ambient.intensity = 0.18 + dayAmount * 0.38;

    // Clouds drift and wrap around the player
    this.clouds.position.x += dt * 1.6;
    for (const cloud of this.clouds.children) {
      const wx = cloud.position.x + this.clouds.position.x;
      if (wx - camera.position.x > 300) cloud.position.x -= 600;
      if (wx - camera.position.x < -300) cloud.position.x += 600;
      const wz = cloud.position.z;
      if (wz - camera.position.z > 300) cloud.position.z -= 600;
      if (wz - camera.position.z < -300) cloud.position.z += 600;
    }

    return this.skyColor;
  }
}
