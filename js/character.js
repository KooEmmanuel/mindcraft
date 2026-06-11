// Blocky character model (player + NPCs) with walk and wave animations.
import * as THREE from 'three';

const LEG_H = 0.68, BODY_H = 0.62, HEAD_S = 0.48;

export const PLAYER_PALETTE = { skin: 0xd9a066, shirt: 0x10b981, pants: 0x2f3b4a, hair: 0x2b2018 };

export const NPC_PALETTES = [
  { skin: 0xd9a066, shirt: 0xc0563d, pants: 0x4a3b2b, hair: 0x1d1d1d },
  { skin: 0xb97a4e, shirt: 0x4d7ec7, pants: 0x32343c, hair: 0x0e0e0e },
  { skin: 0xe8b88a, shirt: 0xc7a64d, pants: 0x3c5232, hair: 0x6b3a16 },
  { skin: 0x8a5a3a, shirt: 0x9a4dc7, pants: 0x2b2b33, hair: 0x111111 },
  { skin: 0xd9a066, shirt: 0xd96aa0, pants: 0x44382c, hair: 0x46280f },
  { skin: 0xc78b5c, shirt: 0x52a0a8, pants: 0x37424e, hair: 0x23150a },
];

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

// A limb group whose pivot is at the top (shoulder/hip)
function limb(w, h, d, color) {
  const group = new THREE.Group();
  const mesh = box(w, h, d, color);
  mesh.position.y = -h / 2;
  group.add(mesh);
  return group;
}

export function buildCharacter(palette = PLAYER_PALETTE) {
  const root = new THREE.Group(); // pivot at feet, faces +z at rotation 0

  const legL = limb(0.2, LEG_H, 0.24, palette.pants);
  legL.position.set(-0.12, LEG_H, 0);
  const legR = limb(0.2, LEG_H, 0.24, palette.pants);
  legR.position.set(0.12, LEG_H, 0);

  const body = box(0.46, BODY_H, 0.26, palette.shirt);
  body.position.y = LEG_H + BODY_H / 2;

  const armL = limb(0.16, 0.6, 0.2, palette.shirt);
  armL.position.set(-0.31, LEG_H + BODY_H - 0.02, 0);
  const armR = limb(0.16, 0.6, 0.2, palette.shirt);
  armR.position.set(0.31, LEG_H + BODY_H - 0.02, 0);
  // skin-tone hands
  const handL = box(0.16, 0.16, 0.2, palette.skin);
  handL.position.y = -0.52;
  armL.add(handL);
  const handR = box(0.16, 0.16, 0.2, palette.skin);
  handR.position.y = -0.52;
  armR.add(handR);

  const head = new THREE.Group();
  head.position.y = LEG_H + BODY_H + HEAD_S / 2;
  const skull = box(HEAD_S, HEAD_S, HEAD_S, palette.skin);
  head.add(skull);
  const hair = box(HEAD_S + 0.04, 0.14, HEAD_S + 0.04, palette.hair);
  hair.position.y = HEAD_S / 2 - 0.05;
  head.add(hair);
  // eyes on the +z face
  for (const ex of [-0.11, 0.11]) {
    const eye = box(0.07, 0.07, 0.02, 0x1a1a2a);
    eye.position.set(ex, 0.02, HEAD_S / 2 + 0.01);
    head.add(eye);
  }

  root.add(legL, legR, body, armL, armR, head);

  const state = { phase: 0, waveTime: 0, sitting: false };

  return {
    group: root,
    head,
    setWave(seconds) { state.waveTime = seconds; },
    setSitting(flag) {
      state.sitting = flag;
      if (!flag) { legL.rotation.x = 0; legR.rotation.x = 0; armL.rotation.x = 0; armR.rotation.x = 0; }
    },
    /** walkSpeed01: 0 idle .. 1 full stride */
    animate(dt, walkSpeed01) {
      if (state.sitting) {
        legL.rotation.x = -1.4;
        legR.rotation.x = -1.4;
        armL.rotation.x = -0.7;
        armR.rotation.x = -0.7;
        return;
      }
      state.phase += dt * (4 + walkSpeed01 * 7);
      const swing = Math.sin(state.phase) * 0.75 * walkSpeed01;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.85;

      if (state.waveTime > 0) {
        state.waveTime -= dt;
        armR.rotation.x = 0;
        armR.rotation.z = -Math.PI * 0.85 + Math.sin(state.phase * 2.2) * 0.25;
      } else {
        armR.rotation.z = 0;
        armR.rotation.x = swing * 0.85;
      }

      // subtle idle sway
      if (walkSpeed01 < 0.05) {
        const idle = Math.sin(state.phase * 0.4) * 0.04;
        armL.rotation.x = idle;
        if (state.waveTime <= 0) armR.rotation.x = -idle;
        legL.rotation.x = 0;
        legR.rotation.x = 0;
      }
    },
  };
}
