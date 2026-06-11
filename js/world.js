// Chunked voxel world: procedural terrain, caves, trees, AO meshing, raycasting.
import * as THREE from 'three';
import { makeNoise } from './noise.js';
import {
  BLOCKS, AIR, GRASS, DIRT, STONE, SAND, LOG, LEAVES, WATER,
  FLOWER_RED, FLOWER_YELLOW, SNOW, BEDROCK,
} from './blocks.js';

export const CHUNK = 16;
export const HEIGHT = 96;
export const WATER_Y = 30;
export const RENDER_DIST = 5;

const idx = (x, y, z) => y * CHUNK * CHUNK + z * CHUNK + x;

// Per-face data: normal n, tangents u/v with cross(u,v) = n (CCW winding from outside)
const FACES = [
  { n: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0], shade: 0.80 },
  { n: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0], shade: 0.80 },
  { n: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, -1], shade: 1.00 },
  { n: [0, -1, 0], u: [1, 0, 0],  v: [0, 0, 1], shade: 0.55 },
  { n: [0, 0, 1],  u: [1, 0, 0],  v: [0, 1, 0], shade: 0.88 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.88 },
];
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const AO_BRIGHT = [1.0, 0.82, 0.68, 0.55];

export class World {
  constructor(scene, atlas, seed) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.noise = makeNoise(seed);
    this.chunks = new Map();
    this.meshQueue = [];

    this.matOpaque = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
    this.matCutout = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    this.matWater = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
  }

  key(cx, cz) { return cx + ',' + cz; }

  surfaceHeight(x, z) {
    const base = this.noise.fbm2(x * 0.008, z * 0.008, 4);
    const m = this.noise.fbm2(x * 0.003 + 100, z * 0.003 - 50, 4);
    const mountains = Math.pow(Math.max(0, m - 0.40) * 2.2, 1.5) * 48;
    return Math.floor(18 + base * 24 + mountains);
  }

  treeAt(x, z) {
    if (this.noise.hash2(x, z) >= 0.0085) return null;
    const h = this.surfaceHeight(x, z);
    if (h <= WATER_Y + 1 || h > 46) return null;
    const r = this.noise.hash2(x * 3 + 7, z * 3 - 11);
    return { x, z, base: h + 1, trunk: 4 + Math.floor(r * 3) };
  }

  ensureData(cx, cz) {
    const k = this.key(cx, cz);
    let chunk = this.chunks.get(k);
    if (chunk && chunk.data) return chunk;
    if (!chunk) { chunk = { cx, cz, data: null, meshes: null, dirty: false }; this.chunks.set(k, chunk); }

    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const n = this.noise;

    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        const wx = cx * CHUNK + lx, wz = cz * CHUNK + lz;
        const h = this.surfaceHeight(wx, wz);
        const beach = h <= WATER_Y + 1;
        const snowy = h > 48;

        for (let y = 0; y <= Math.max(h, WATER_Y); y++) {
          let t = AIR;
          if (y === 0) t = BEDROCK;
          else if (y <= h - 4) t = STONE;
          else if (y < h) t = beach ? SAND : DIRT;
          else if (y === h) t = beach ? SAND : (snowy ? SNOW : GRASS);
          else if (y <= WATER_Y) t = WATER;

          // Carve spaghetti caves through stone/dirt (never through bedrock or into water)
          if (t === STONE || t === DIRT || (t === GRASS && y > WATER_Y + 2)) {
            const a = n.noise3(wx * 0.045, y * 0.045, wz * 0.045);
            const b = n.noise3(wx * 0.045 + 333, y * 0.045 + 333, wz * 0.045 + 333);
            if (Math.abs(a - 0.5) < 0.045 && Math.abs(b - 0.5) < 0.055 && y > 4 && y < h - 2) t = AIR;
          }
          data[idx(lx, y, lz)] = t;
        }

        // Flowers on grass
        if (!beach && !snowy && data[idx(lx, h, lz)] === GRASS && h + 1 < HEIGHT) {
          const f = n.hash2(wx * 5 - 3, wz * 5 + 9);
          if (f < 0.02 && data[idx(lx, h + 1, lz)] === AIR) {
            data[idx(lx, h + 1, lz)] = f < 0.01 ? FLOWER_RED : FLOWER_YELLOW;
          }
        }
      }
    }

    // Trees — scan a margin so canopies crossing chunk borders are consistent
    for (let wx = cx * CHUNK - 3; wx < (cx + 1) * CHUNK + 3; wx++) {
      for (let wz = cz * CHUNK - 3; wz < (cz + 1) * CHUNK + 3; wz++) {
        const tree = this.treeAt(wx, wz);
        if (!tree) continue;
        const top = tree.base + tree.trunk;
        const put = (x, y, z, t, soft) => {
          const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
          if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
          const i = idx(lx, y, lz);
          if (soft && data[i] !== AIR && data[i] !== LEAVES) return;
          data[i] = t;
        };
        // Canopy
        for (let dy = -2; dy <= 1; dy++) {
          const radius = dy <= -1 ? 2 : 1;
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
              if (Math.abs(dx) === radius && Math.abs(dz) === radius && this.noise.hash3(wx + dx, top + dy, wz + dz) < 0.5) continue;
              put(wx + dx, top + dy, wz + dz, LEAVES, true);
            }
          }
        }
        put(wx, top + 2, wz, LEAVES, true);
        // Trunk
        for (let y = tree.base; y < top; y++) put(wx, y, wz, LOG, false);
      }
    }

    chunk.data = data;
    return chunk;
  }

  getBlock(x, y, z) {
    if (y < 0) return BEDROCK;
    if (y >= HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk || !chunk.data) return AIR;
    return chunk.data[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  setBlock(x, y, z, t) {
    if (y < 1 || y >= HEIGHT) return;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const chunk = this.ensureData(cx, cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    chunk.data[idx(lx, y, lz)] = t;
    // Breaking the ground under a flower pops the flower too
    if (t === AIR && y + 1 < HEIGHT) {
      const above = BLOCKS[chunk.data[idx(lx, y + 1, lz)]];
      if (above && above.cross) chunk.data[idx(lx, y + 1, lz)] = AIR;
    }
    this.buildMesh(chunk);
    if (lx === 0) this.remesh(cx - 1, cz);
    if (lx === CHUNK - 1) this.remesh(cx + 1, cz);
    if (lz === 0) this.remesh(cx, cz - 1);
    if (lz === CHUNK - 1) this.remesh(cx, cz + 1);
  }

  remesh(cx, cz) {
    const chunk = this.chunks.get(this.key(cx, cz));
    if (chunk && chunk.meshes) this.buildMesh(chunk);
  }

  isSolid(x, y, z) {
    const b = BLOCKS[this.getBlock(x, y, z)];
    return b ? (b.solid && !b.cross) : false;
  }

  occludes(t) {
    const b = BLOCKS[t];
    return b && b.solid && !b.transparent && !b.cross;
  }

  buildMesh(chunk) {
    const { cx, cz } = chunk;
    // Make sure neighbor data exists so border faces are correct
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.ensureData(cx + dx, cz + dz);

    const buf = {
      opaque: { pos: [], norm: [], uv: [], col: [], index: [] },
      cutout: { pos: [], norm: [], uv: [], col: [], index: [] },
      water:  { pos: [], norm: [], uv: [], col: [], index: [] },
    };
    const data = chunk.data;
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;

    const getLocal = (lx, y, lz) => {
      if (y < 0) return BEDROCK;
      if (y >= HEIGHT) return AIR;
      if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK) return data[idx(lx, y, lz)];
      return this.getBlock(baseX + lx, y, baseZ + lz);
    };

    const pushQuad = (b, verts, normal, tile, shade, aoVals, tintMul) => {
      const [u0, v0, u1, v1] = this.atlas.uvRect(tile);
      const start = b.pos.length / 3;
      for (let i = 0; i < 4; i++) {
        b.pos.push(verts[i][0], verts[i][1], verts[i][2]);
        b.norm.push(normal[0], normal[1], normal[2]);
        const [su, sv] = CORNERS[i];
        b.uv.push(su < 0 ? u0 : u1, sv < 0 ? v0 : v1);
        const bright = shade * aoVals[i] * tintMul;
        b.col.push(bright, bright, bright);
      }
      b.index.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };

    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let y = 0; y < HEIGHT; y++) {
          const t = data[idx(lx, y, lz)];
          if (t === AIR) continue;
          const def = BLOCKS[t];

          if (def.cross) {
            // Two crossed quads
            const x = lx, z = lz;
            const [u0, v0, u1, v1] = this.atlas.uvRect(def.tiles.side);
            const quads = [
              [[x + 0.15, y, z + 0.15], [x + 0.85, y, z + 0.85], [x + 0.85, y + 1, z + 0.85], [x + 0.15, y + 1, z + 0.15]],
              [[x + 0.85, y, z + 0.15], [x + 0.15, y, z + 0.85], [x + 0.15, y + 1, z + 0.85], [x + 0.85, y + 1, z + 0.15]],
            ];
            for (const q of quads) {
              const b = buf.cutout;
              const start = b.pos.length / 3;
              const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
              for (let i = 0; i < 4; i++) {
                b.pos.push(q[i][0], q[i][1], q[i][2]);
                b.norm.push(0, 1, 0);
                b.uv.push(uvs[i][0], uvs[i][1]);
                b.col.push(1, 1, 1);
              }
              b.index.push(start, start + 1, start + 2, start, start + 2, start + 3);
            }
            continue;
          }

          const isWater = !!def.water;
          const target = isWater ? buf.water : (def.cutout ? buf.cutout : buf.opaque);
          const topIsOpen = !BLOCKS[getLocal(lx, y + 1, lz)] || getLocal(lx, y + 1, lz) !== WATER;
          const topY = isWater && topIsOpen ? y + 0.875 : y + 1;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nb = getLocal(lx + face.n[0], y + face.n[1], lz + face.n[2]);
            // Face visibility
            if (isWater) {
              if (nb !== AIR) continue; // water only renders against open air
            } else {
              const nbDef = BLOCKS[nb];
              if (nbDef && !nbDef.transparent) continue;       // hidden by opaque neighbor
              if (nb === t && !def.drawSame) continue;          // same transparent type (glass-glass)
              if (def.transparent && nb === t && !def.drawSame) continue;
            }

            // AO per vertex (skip for water/glowing)
            const aoVals = [1, 1, 1, 1];
            if (!isWater && !def.glow) {
              for (let i = 0; i < 4; i++) {
                const [su, sv] = CORNERS[i];
                const s1 = this.occludes(getLocal(lx + face.n[0] + face.u[0] * su, y + face.n[1] + face.u[1] * su, lz + face.n[2] + face.u[2] * su)) ? 1 : 0;
                const s2 = this.occludes(getLocal(lx + face.n[0] + face.v[0] * sv, y + face.n[1] + face.v[1] * sv, lz + face.n[2] + face.v[2] * sv)) ? 1 : 0;
                const c = this.occludes(getLocal(
                  lx + face.n[0] + face.u[0] * su + face.v[0] * sv,
                  y + face.n[1] + face.u[1] * su + face.v[1] * sv,
                  lz + face.n[2] + face.u[2] * su + face.v[2] * sv)) ? 1 : 0;
                const level = (s1 && s2) ? 3 : s1 + s2 + c;
                aoVals[i] = AO_BRIGHT[level];
              }
            }

            // Build the 4 corner positions
            const cxc = lx + 0.5, cyc = (y + (isWater && topIsOpen ? (topY - y) : 1) / 2), czc = lz + 0.5;
            const hy = isWater && topIsOpen ? (topY - y) / 2 : 0.5;
            const verts = [];
            for (let i = 0; i < 4; i++) {
              const [su, sv] = CORNERS[i];
              verts.push([
                cxc + face.n[0] * 0.5 + face.u[0] * su * 0.5 + face.v[0] * sv * 0.5,
                cyc + face.n[1] * hy + face.u[1] * su * hy + face.v[1] * sv * hy,
                czc + face.n[2] * 0.5 + face.u[2] * su * 0.5 + face.v[2] * sv * 0.5,
              ]);
            }

            const tile = face.n[1] === 1 ? def.tiles.top : (face.n[1] === -1 ? def.tiles.bottom : def.tiles.side);
            const glow = def.glow ? 1.45 : 1.0;
            pushQuad(target, verts, face.n, tile, face.shade, aoVals, glow);
          }
        }
      }
    }

    // Swap in the new meshes
    if (chunk.meshes) this.disposeMeshes(chunk);
    chunk.meshes = {};
    const mats = { opaque: this.matOpaque, cutout: this.matCutout, water: this.matWater };
    for (const kind of ['opaque', 'cutout', 'water']) {
      const b = buf[kind];
      if (b.index.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.index);
      const mesh = new THREE.Mesh(geo, mats[kind]);
      mesh.position.set(baseX, 0, baseZ);
      if (kind === 'water') mesh.renderOrder = 1;
      this.scene.add(mesh);
      chunk.meshes[kind] = mesh;
    }
    chunk.dirty = false;
  }

  disposeMeshes(chunk) {
    for (const kind in chunk.meshes) {
      const mesh = chunk.meshes[kind];
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    chunk.meshes = null;
  }

  // Stream chunks around the player; build a couple of meshes per frame
  update(px, pz) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);

    // Data for player's immediate ring (physics safety)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.ensureData(pcx + dx, pcz + dz);

    // Queue missing meshes within render distance
    this.meshQueue.length = 0;
    for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
      for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        const chunk = this.chunks.get(this.key(cx, cz));
        if (!chunk || !chunk.meshes) {
          this.meshQueue.push({ cx, cz, d: dx * dx + dz * dz });
        }
      }
    }
    this.meshQueue.sort((a, b) => a.d - b.d);

    let built = 0;
    for (const item of this.meshQueue) {
      if (built >= 2) break;
      const chunk = this.ensureData(item.cx, item.cz);
      if (!chunk.meshes) { this.buildMesh(chunk); built++; }
    }

    // Unload far chunks
    for (const [k, chunk] of this.chunks) {
      const d = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      if (d > RENDER_DIST + 2) {
        if (chunk.meshes) this.disposeMeshes(chunk);
        this.chunks.delete(k);
      }
    }

    return this.meshQueue.length;
  }

  // Amanatides & Woo voxel traversal. Returns {x,y,z,nx,ny,nz,block} or null.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ;
    if (stepX === 0) tMaxX = Infinity;
    if (stepY === 0) tMaxY = Infinity;
    if (stepZ === 0) tMaxZ = Infinity;

    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const block = this.getBlock(x, y, z);
      const def = BLOCKS[block];
      if (block !== AIR && def && !def.water) {
        return { x, y, z, nx, ny, nz, block };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }
}
