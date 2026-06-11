// Block registry + procedurally painted texture atlas (no image assets).
import * as THREE from 'three';

export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, LOG = 5,
  LEAVES = 6, PLANKS = 7, GLASS = 8, GLOWSTONE = 9, WATER = 10,
  FLOWER_RED = 11, FLOWER_YELLOW = 12, SNOW = 13, BEDROCK = 14;

// Atlas tile indices (8 cols x 2 rows, 16px tiles)
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, LOG_SIDE: 5, LOG_TOP: 6, LEAVES: 7,
  PLANKS: 8, GLASS: 9, GLOWSTONE: 10, WATER: 11, FLOWER_RED: 12, FLOWER_YELLOW: 13, SNOW: 14, BEDROCK: 15,
};

export const BLOCKS = {
  [AIR]:           { name: 'air', solid: false, transparent: true, cross: false },
  [GRASS]:         { name: 'Grass', solid: true, transparent: false, cross: false, tiles: { top: T.GRASS_TOP, side: T.GRASS_SIDE, bottom: T.DIRT }, color: 0x6abe30 },
  [DIRT]:          { name: 'Dirt', solid: true, transparent: false, cross: false, tiles: { top: T.DIRT, side: T.DIRT, bottom: T.DIRT }, color: 0x8a5a2b },
  [STONE]:         { name: 'Stone', solid: true, transparent: false, cross: false, tiles: { top: T.STONE, side: T.STONE, bottom: T.STONE }, color: 0x8a8a8a },
  [SAND]:          { name: 'Sand', solid: true, transparent: false, cross: false, tiles: { top: T.SAND, side: T.SAND, bottom: T.SAND }, color: 0xdcd1a0 },
  [LOG]:           { name: 'Oak Log', solid: true, transparent: false, cross: false, tiles: { top: T.LOG_TOP, side: T.LOG_SIDE, bottom: T.LOG_TOP }, color: 0x6b4a2b },
  [LEAVES]:        { name: 'Leaves', solid: true, transparent: true, drawSame: true, cross: false, tiles: { top: T.LEAVES, side: T.LEAVES, bottom: T.LEAVES }, color: 0x3e7c2a, cutout: true },
  [PLANKS]:        { name: 'Planks', solid: true, transparent: false, cross: false, tiles: { top: T.PLANKS, side: T.PLANKS, bottom: T.PLANKS }, color: 0xb08850 },
  [GLASS]:         { name: 'Glass', solid: true, transparent: true, cross: false, tiles: { top: T.GLASS, side: T.GLASS, bottom: T.GLASS }, color: 0xcfeef5, cutout: true },
  [GLOWSTONE]:     { name: 'Glowstone', solid: true, transparent: false, cross: false, tiles: { top: T.GLOWSTONE, side: T.GLOWSTONE, bottom: T.GLOWSTONE }, color: 0xffd45e, glow: true },
  [WATER]:         { name: 'Water', solid: false, transparent: true, cross: false, tiles: { top: T.WATER, side: T.WATER, bottom: T.WATER }, color: 0x3d6edb, water: true },
  [FLOWER_RED]:    { name: 'Rose', solid: false, transparent: true, cross: true, tiles: { side: T.FLOWER_RED }, color: 0xd43b3b },
  [FLOWER_YELLOW]: { name: 'Dandelion', solid: false, transparent: true, cross: true, tiles: { side: T.FLOWER_YELLOW }, color: 0xe8c93a },
  [SNOW]:          { name: 'Snow', solid: true, transparent: false, cross: false, tiles: { top: T.SNOW, side: T.SNOW, bottom: T.DIRT }, color: 0xf2f5f7 },
  [BEDROCK]:       { name: 'Bedrock', solid: true, transparent: false, cross: false, tiles: { top: T.BEDROCK, side: T.BEDROCK, bottom: T.BEDROCK }, color: 0x333333 },
};

export const HOTBAR = [GRASS, DIRT, STONE, LOG, PLANKS, SAND, GLASS, GLOWSTONE, LEAVES];

const COLS = 8, ROWS = 2, TILE = 16;

// Tiny deterministic rng for speckling textures
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function fill(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE, TILE);
}

function speckle(ctx, r, colors, density) {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++)
      if (r() < density) px(ctx, x, y, colors[Math.floor(r() * colors.length)]);
}

const painters = {
  [T.GRASS_TOP](ctx, r) { fill(ctx, '#5fae2e'); speckle(ctx, r, ['#6abe30', '#549c28', '#74c93c', '#4d9024'], 0.55); },
  [T.GRASS_SIDE](ctx, r) {
    fill(ctx, '#8a5a2b'); speckle(ctx, r, ['#7c4f24', '#96642f', '#6e4520'], 0.4);
    ctx.fillStyle = '#5fae2e'; ctx.fillRect(0, 0, TILE, 3);
    for (let x = 0; x < TILE; x++) if (r() < 0.6) px(ctx, x, 3, '#549c28');
    for (let x = 0; x < TILE; x++) if (r() < 0.25) px(ctx, x, 4, '#549c28');
  },
  [T.DIRT](ctx, r) { fill(ctx, '#8a5a2b'); speckle(ctx, r, ['#7c4f24', '#96642f', '#6e4520', '#a06c34'], 0.45); },
  [T.STONE](ctx, r) {
    fill(ctx, '#8a8a8a'); speckle(ctx, r, ['#7e7e7e', '#969696', '#747474'], 0.35);
    for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 12), y = Math.floor(r() * 12); ctx.fillStyle = '#737373'; ctx.fillRect(x, y, 2 + Math.floor(r() * 3), 2); }
  },
  [T.SAND](ctx, r) { fill(ctx, '#dcd1a0'); speckle(ctx, r, ['#d2c694', '#e6dcae', '#c9bd8a'], 0.5); },
  [T.LOG_SIDE](ctx, r) {
    fill(ctx, '#6b4a2b');
    for (let x = 0; x < TILE; x++) {
      const shade = ['#5e4026', '#765332', '#6b4a2b', '#523823'][x % 4];
      ctx.fillStyle = shade; ctx.fillRect(x, 0, 1, TILE);
      if (r() < 0.3) px(ctx, x, Math.floor(r() * TILE), '#4a3320');
    }
  },
  [T.LOG_TOP](ctx, r) {
    fill(ctx, '#b08850');
    ctx.strokeStyle = '#8a6a3c';
    for (let i = 1; i <= 3; i++) { ctx.strokeRect(i * 2 + 0.5, i * 2 + 0.5, TILE - i * 4 - 1, TILE - i * 4 - 1); }
    ctx.strokeStyle = '#6b4a2b'; ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
  },
  [T.LEAVES](ctx, r) {
    ctx.clearRect(0, 0, TILE, TILE);
    fill(ctx, '#3e7c2a'); speckle(ctx, r, ['#356c24', '#488f31', '#2e6120', '#52a039'], 0.6);
    for (let i = 0; i < 10; i++) ctx.clearRect(Math.floor(r() * TILE), Math.floor(r() * TILE), 1, 1);
  },
  [T.PLANKS](ctx, r) {
    fill(ctx, '#b08850'); speckle(ctx, r, ['#a37c46', '#bb9258', '#9a7440'], 0.3);
    ctx.fillStyle = '#7e5e34';
    ctx.fillRect(0, 3, TILE, 1); ctx.fillRect(0, 7, TILE, 1); ctx.fillRect(0, 11, TILE, 1); ctx.fillRect(0, 15, TILE, 1);
    ctx.fillRect(4, 0, 1, 4); ctx.fillRect(11, 4, 1, 4); ctx.fillRect(6, 8, 1, 4); ctx.fillRect(13, 12, 1, 4);
  },
  [T.GLASS](ctx, r) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(220,245,250,0.85)';
    ctx.fillRect(0, 0, TILE, 1); ctx.fillRect(0, TILE - 1, TILE, 1); ctx.fillRect(0, 0, 1, TILE); ctx.fillRect(TILE - 1, 0, 1, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    px(ctx, 3, 3, 'rgba(255,255,255,0.8)'); px(ctx, 4, 4, 'rgba(255,255,255,0.8)');
    px(ctx, 11, 8, 'rgba(255,255,255,0.6)'); px(ctx, 12, 9, 'rgba(255,255,255,0.6)');
  },
  [T.GLOWSTONE](ctx, r) {
    fill(ctx, '#c79a3e'); speckle(ctx, r, ['#ffd45e', '#ffe898', '#e8b54a', '#fff3c0'], 0.55);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#fff3c0'; ctx.fillRect(Math.floor(r() * 13), Math.floor(r() * 13), 2, 2); }
  },
  [T.WATER](ctx, r) { fill(ctx, '#3d6edb'); speckle(ctx, r, ['#4679e3', '#3463c9', '#5184ea'], 0.4); },
  [T.FLOWER_RED](ctx, r) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#3e8f2e'; ctx.fillRect(7, 8, 1, 8); px(ctx, 6, 11, '#3e8f2e'); px(ctx, 8, 12, '#3e8f2e');
    ctx.fillStyle = '#d43b3b'; ctx.fillRect(5, 3, 5, 5);
    ctx.fillStyle = '#a82828'; px(ctx, 5, 3, '#a82828'); px(ctx, 9, 3, '#a82828'); px(ctx, 5, 7, '#a82828'); px(ctx, 9, 7, '#a82828');
    ctx.fillStyle = '#f0d24a'; ctx.fillRect(7, 5, 1, 1);
  },
  [T.FLOWER_YELLOW](ctx, r) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = '#3e8f2e'; ctx.fillRect(7, 9, 1, 7); px(ctx, 8, 12, '#3e8f2e');
    ctx.fillStyle = '#e8c93a'; ctx.fillRect(6, 4, 4, 4); px(ctx, 7, 3, '#e8c93a'); px(ctx, 8, 8, '#e8c93a');
    ctx.fillStyle = '#c7a626'; px(ctx, 7, 5, '#c7a626'); px(ctx, 8, 6, '#c7a626');
  },
  [T.SNOW](ctx, r) { fill(ctx, '#f2f5f7'); speckle(ctx, r, ['#e6ebef', '#ffffff', '#dde4e9'], 0.35); },
  [T.BEDROCK](ctx, r) {
    fill(ctx, '#3a3a3a'); speckle(ctx, r, ['#2b2b2b', '#4a4a4a', '#555555', '#1f1f1f'], 0.6);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#222'; ctx.fillRect(Math.floor(r() * 12), Math.floor(r() * 12), 3, 2); }
  },
};

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < COLS * ROWS; i++) {
    if (!painters[i]) continue;
    const col = i % COLS, row = Math.floor(i / COLS);
    ctx.save();
    ctx.translate(col * TILE, row * TILE);
    ctx.beginPath();
    ctx.rect(0, 0, TILE, TILE);
    ctx.clip();
    painters[i](ctx, rng(i * 7919 + 13));
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  // uv rect for a tile, accounting for canvas-texture Y flip
  function uvRect(tile) {
    const col = tile % COLS, row = Math.floor(tile / COLS);
    const u0 = col / COLS, u1 = (col + 1) / COLS;
    const v1 = 1 - row / ROWS, v0 = 1 - (row + 1) / ROWS;
    return [u0, v0, u1, v1];
  }

  return { canvas, texture, uvRect, COLS, ROWS, TILE };
}
