// MINDCRAFT — a voxel world in the browser. Built live by Claude Fable 5.
import * as THREE from 'three';
import { buildAtlas, BLOCKS, HOTBAR, AIR, WATER } from './blocks.js';
import { World, WATER_Y, RENDER_DIST, CHUNK } from './world.js';
import { Player } from './player.js';
import { Particles, Sound } from './effects.js';
import { Sky } from './sky.js';
import { buildCharacter, PLAYER_PALETTE } from './character.js';
import { NPCs } from './npc.js';
import { Collectibles } from './collectibles.js';
import { Kart } from './kart.js';
import { Enemies } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Race } from './race.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed')) || 1337;
const DAY_LENGTH = 240; // seconds per full day/night cycle

// --- Renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, RENDER_DIST * CHUNK * 0.45, RENDER_DIST * CHUNK * 0.95);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1000);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- World / player / effects ---
const atlas = buildAtlas();
const world = new World(scene, atlas, seed);
const particles = new Particles(scene);
const sound = new Sound();
const sky = new Sky(scene);

// Find a dry spawn column
let spawnX = 8, spawnZ = 8;
for (let i = 0; i < 200; i++) {
  if (world.surfaceHeight(spawnX, spawnZ) > WATER_Y + 1) break;
  spawnX += 7; spawnZ += 3;
}
const player = new Player(world, {
  x: spawnX + 0.5,
  y: world.surfaceHeight(spawnX, spawnZ) + 2,
  z: spawnZ + 0.5,
});

// Player character model (visible in third-person view)
const playerChar = buildCharacter(PLAYER_PALETTE);
playerChar.group.visible = false;
scene.add(playerChar.group);
let thirdPerson = true; // start where you can see yourself

// Game systems
const npcs = new NPCs(scene, world, spawnX, spawnZ);
const collectibles = new Collectibles(scene, world, spawnX, spawnZ);
const kart = new Kart(scene, world, particles);
const enemies = new Enemies(scene, world, spawnX, spawnZ);
const projectiles = new Projectiles(scene, world, particles, sound);
const race = new Race(scene, world, spawnX, spawnZ);
let driving = false;
let score = 0;
const scoreEl = document.getElementById('score');
function addScore(n) {
  score += n;
  scoreEl.textContent = `◆ ${score}`;
}

// Block highlight wireframe
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 })
);
highlight.visible = false;
scene.add(highlight);

// --- Input ---
const input = { forward: false, back: false, left: false, right: false, jump: false, down: false, sprint: false };
let locked = false;
let hudVisible = true;
let selectedSlot = 0;

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-state');
const hud = document.getElementById('hud');
const underwater = document.getElementById('underwater');
const hitflash = document.getElementById('hitflash');
const raceEl = document.getElementById('race');
document.getElementById('seed-label').textContent = `seed ${seed}`;

document.getElementById('play').addEventListener('click', async () => {
  sound.ensure();
  try {
    await renderer.domElement.requestPointerLock();
  } catch {
    overlayTitle.textContent = 'One sec\u2026 click PLAY again';
  }
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  overlay.style.display = locked ? 'none' : 'flex';
  if (!locked) overlayTitle.textContent = 'Paused';
});

document.addEventListener('mousemove', (e) => {
  if (!locked || driving) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
});

const keyMap = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyC: 'down',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
};

function shoot() {
  if (driving) {
    const fwd = kart.forward();
    const origin = kart.pos.clone().add(new THREE.Vector3(fwd.x * 1.3, 1.0, fwd.z * 1.3));
    projectiles.fire(origin, fwd);
  } else {
    const dir = player.lookDir();
    projectiles.fire(player.eyePos().addScaledVector(dir, 0.5), dir);
  }
}

function spotIsFree(x, y, z) {
  const hw = 0.31;
  for (const ox of [-hw, hw]) for (const oz of [-hw, hw]) for (const oy of [0.05, 0.95, 1.75]) {
    if (world.isSolid(Math.floor(x + ox), Math.floor(y + oy), Math.floor(z + oz))) return false;
  }
  return true;
}

function toggleKart() {
  if (driving) {
    driving = false;
    kart.exit();
    // Step out to the first free spot around the kart
    const fwd = kart.forward();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const candidates = [
      kart.pos.clone().addScaledVector(side, 1.3),
      kart.pos.clone().addScaledVector(side, -1.3),
      kart.pos.clone().addScaledVector(fwd, -1.7),
      kart.pos.clone().addScaledVector(fwd, 1.9),
      kart.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
    ];
    let placed = false;
    for (const c of candidates) {
      if (spotIsFree(c.x, c.y + 0.2, c.z)) { player.pos.set(c.x, c.y + 0.2, c.z); placed = true; break; }
    }
    if (!placed) player.pos.set(kart.pos.x, kart.pos.y + 1.2, kart.pos.z); // self-rescue handles the rest
    player.vel.set(0, 0, 0);
    player.yaw = kart.yaw;
    playerChar.setSitting(false);
    flashTip('Parked the kart');
  } else {
    // Enter a nearby parked kart, or summon one right here
    if (!kart.group.visible || kart.pos.distanceTo(player.pos) < 4) {
      kart.enter(player.pos, player.yaw);
      driving = true;
      playerChar.setSitting(true);
      flashTip('Kart time! W/S drive · A/D steer · click to shoot');
    } else {
      kart.enter(player.pos, player.yaw);
      driving = true;
      playerChar.setSitting(true);
      flashTip('New kart delivered 🏎');
    }
  }
}

function toggleRace() {
  if (race.running) {
    race.cancel();
    raceEl.style.display = 'none';
    flashTip('Race cancelled');
  } else {
    race.start();
    raceEl.style.display = '';
    flashTip('RACE! Drive through the green gate →');
  }
}

document.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyF' && !driving) { player.fly = !player.fly; player.vel.set(0, 0, 0); flashTip(player.fly ? 'Fly mode ON' : 'Fly mode OFF'); }
  if (e.code === 'KeyV' && !driving) {
    thirdPerson = !thirdPerson;
    flashTip(thirdPerson ? 'Third-person view' : 'First-person view');
  }
  if (e.code === 'KeyG' && locked) toggleKart();
  if (e.code === 'KeyX' && locked) shoot();
  if (e.code === 'KeyR' && locked) toggleRace();
  if (e.code === 'KeyH') { hudVisible = !hudVisible; hud.style.display = hudVisible ? '' : 'none'; }
  if (/^Digit[1-9]$/.test(e.code)) selectSlot(parseInt(e.code.slice(5)) - 1);
});
document.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
});

addEventListener('wheel', (e) => {
  if (!locked) return;
  selectSlot((selectedSlot + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length);
});

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!locked) return;

  // Driving: clicks shoot fireballs
  if (driving) {
    if (e.button === 0 || e.button === 2) shoot();
    return;
  }

  const hit = world.raycast(player.eyePos(), player.lookDir(), 6);
  if (!hit) return;

  if (e.button === 0) {
    // Break
    const def = BLOCKS[hit.block];
    if (def.name === 'Bedrock') return;
    world.setBlock(hit.x, hit.y, hit.z, AIR);
    particles.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, def.color || 0x888888);
    sound.breakSound(0.7 + (hit.block % 5) * 0.18);
  } else if (e.button === 2) {
    // Place
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const current = world.getBlock(px, py, pz);
    const currentDef = BLOCKS[current];
    const replaceable = current === AIR || current === WATER || (currentDef && currentDef.cross);
    if (!replaceable) return;
    if (player.overlapsBlock(px, py, pz)) return;
    world.setBlock(px, py, pz, HOTBAR[selectedSlot]);
    sound.placeSound();
  }
});
addEventListener('contextmenu', (e) => e.preventDefault());

// --- Hotbar HUD ---
const hotbarEl = document.getElementById('hotbar');
function tileThumb(blockId) {
  const def = BLOCKS[blockId];
  const tile = def.tiles.side ?? def.tiles.top;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const col = tile % atlas.COLS, row = Math.floor(tile / atlas.COLS);
  ctx.drawImage(atlas.canvas, col * atlas.TILE, row * atlas.TILE, atlas.TILE, atlas.TILE, 0, 0, 32, 32);
  return c;
}
HOTBAR.forEach((blockId, i) => {
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.appendChild(tileThumb(blockId));
  const num = document.createElement('span');
  num.textContent = i + 1;
  slot.appendChild(num);
  slot.title = BLOCKS[blockId].name;
  hotbarEl.appendChild(slot);
});
function selectSlot(i) {
  selectedSlot = i;
  [...hotbarEl.children].forEach((el, j) => el.classList.toggle('selected', j === i));
  document.getElementById('block-name').textContent = BLOCKS[HOTBAR[i]].name;
}
selectSlot(0);

let tipTimer = null;
function flashTip(text) {
  const tip = document.getElementById('tip');
  tip.textContent = text;
  tip.style.opacity = 1;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tip.style.opacity = 0; }, 1800);
}

function flashHit() {
  hitflash.style.opacity = 0.5;
  setTimeout(() => { hitflash.style.opacity = 0; }, 160);
}

// --- Camera helpers ---
function occludedDistance(eye, back, maxDist) {
  for (let d = 0.6; d <= maxDist; d += 0.2) {
    const p = eye.clone().addScaledVector(back, d);
    if (world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return Math.max(0.6, d - 0.4);
  }
  return maxDist;
}

// --- Main loop ---
const coordsEl = document.getElementById('coords');
const fpsEl = document.getElementById('fps');
let last = performance.now();
let dayTime = DAY_LENGTH * 0.25; // start mid-morning
let fpsAccum = 0, fpsCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  world.update(player.pos.x, player.pos.z);

  if (driving) {
    if (locked) kart.update(dt, input);
    // Player rides along — keeps world streaming, pickups, enemies working
    player.pos.copy(kart.pos);
    player.yaw = kart.yaw;
    player.vel.set(0, 0, 0);

    // Chase camera behind the kart
    const fwd = kart.forward();
    const eye = kart.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    const back = fwd.clone().multiplyScalar(-1).add(new THREE.Vector3(0, 0.32, 0)).normalize();
    const dist = occludedDistance(eye, back, 6);
    camera.position.copy(eye).addScaledVector(back, dist);
    camera.lookAt(kart.pos.x + fwd.x * 3, kart.pos.y + 1.1, kart.pos.z + fwd.z * 3);

    // Seat the character on the kart
    playerChar.group.visible = true;
    playerChar.group.position.set(
      kart.pos.x - fwd.x * 0.18,
      kart.pos.y + 0.34,
      kart.pos.z - fwd.z * 0.18
    );
    playerChar.group.rotation.y = kart.yaw;
    playerChar.animate(dt, 0);
  } else {
    if (locked) player.update(dt, input);

    if (thirdPerson) {
      const eye = player.eyePos();
      const back = player.lookDir().multiplyScalar(-1);
      const dist = occludedDistance(eye, back, 4.2);
      camera.position.copy(eye).addScaledVector(back, dist).add(new THREE.Vector3(0, 0.3, 0));
      camera.lookAt(eye.x, eye.y, eye.z);
      playerChar.group.visible = true;
      playerChar.group.position.set(player.pos.x, player.pos.y, player.pos.z);
      playerChar.group.rotation.y = player.yaw;
      const hSpeed = Math.hypot(player.vel.x, player.vel.z);
      playerChar.animate(dt, Math.min(1, hSpeed / 5));
    } else {
      playerChar.group.visible = false;
      player.applyCamera(camera);
    }
  }

  particles.update(dt);
  npcs.update(dt, player.pos);

  // Enemies: bump on foot = knockback; run one over with the kart = squash!
  enemies.update(dt, player.pos, (slime, dir) => {
    if (driving && Math.abs(kart.speed) > 6) {
      particles.burst(slime.pos.x, slime.pos.y + 0.5, slime.pos.z, 0x7a3fc4, 26);
      slime.kill();
      sound.breakSound(0.4);
      addScore(5);
      flashTip('Squashed! +5 ◆');
    } else if (!driving && !player.fly) {
      player.vel.x += dir.x * 9;
      player.vel.z += dir.z * 9;
      player.vel.y = 4.5;
      sound.breakSound(0.35);
      flashHit();
    }
  });

  projectiles.update(dt, enemies, () => {
    addScore(5);
    flashTip('Direct hit! +5 ◆');
  });

  collectibles.update(dt, time, new THREE.Vector3(player.pos.x, player.pos.y + 0.9, player.pos.z), () => {
    addScore(1);
    sound.pickupSound();
  });

  // Race
  const raceEvent = race.update(new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z), time);
  if (raceEvent === 'gate') sound.pickupSound();
  if (raceEvent === 'finish') {
    raceEl.style.display = 'none';
    sound.pickupSound();
    flashTip(`FINISH! ${race.elapsed().toFixed(1)}s · best ${race.best()}`);
  }
  if (race.running) {
    raceEl.textContent = `🏁 GATE ${race.index + 1}/8 · ${race.elapsed().toFixed(1)}s · best ${race.best()}`;
  }

  // Day/night
  dayTime = (dayTime + dt) % DAY_LENGTH;
  const skyColor = sky.update(dayTime / DAY_LENGTH, camera, dt);
  scene.background = skyColor;
  scene.fog.color.copy(skyColor);

  // Highlight targeted block (not while driving)
  const hit = locked && !driving ? world.raycast(player.eyePos(), player.lookDir(), 6) : null;
  if (hit) {
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    highlight.visible = true;
  } else {
    highlight.visible = false;
  }

  // Underwater tint
  underwater.style.opacity = player.inWater ? 1 : 0;

  // HUD readouts
  fpsAccum += dt; fpsCount++;
  if (fpsAccum >= 0.5) {
    fpsEl.textContent = `${Math.round(fpsCount / fpsAccum)} fps${driving ? ` · ${Math.abs(kart.speed * 3.6).toFixed(0)} km/h` : ''}`;
    coordsEl.textContent = `${Math.floor(player.pos.x)}, ${Math.floor(player.pos.y)}, ${Math.floor(player.pos.z)}`;
    fpsAccum = 0; fpsCount = 0;
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Debug hooks for automated testing (harmless in production)
window.MC = { toggleKart, toggleRace, shoot, get driving() { return driving; } };
