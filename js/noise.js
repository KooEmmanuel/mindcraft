// Seeded value noise — deterministic world generation with zero dependencies.

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function hash3(ix, iy, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 2246822519) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function makeNoise(seed) {
  function noise2(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const sx = smooth(x - x0), sz = smooth(z - z0);
    return lerp(
      lerp(hash2(x0, z0, seed), hash2(x0 + 1, z0, seed), sx),
      lerp(hash2(x0, z0 + 1, seed), hash2(x0 + 1, z0 + 1, seed), sx),
      sz
    );
  }

  function noise3(x, y, z) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const sx = smooth(x - x0), sy = smooth(y - y0), sz = smooth(z - z0);
    const c00 = lerp(hash3(x0, y0, z0, seed), hash3(x0 + 1, y0, z0, seed), sx);
    const c10 = lerp(hash3(x0, y0 + 1, z0, seed), hash3(x0 + 1, y0 + 1, z0, seed), sx);
    const c01 = lerp(hash3(x0, y0, z0 + 1, seed), hash3(x0 + 1, y0, z0 + 1, seed), sx);
    const c11 = lerp(hash3(x0, y0 + 1, z0 + 1, seed), hash3(x0 + 1, y0 + 1, z0 + 1, seed), sx);
    return lerp(lerp(c00, c10, sy), lerp(c01, c11, sy), sz);
  }

  function fbm2(x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise2(x * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  return { noise2, noise3, fbm2, hash2: (x, z) => hash2(x, z, seed), hash3: (x, y, z) => hash3(x, y, z, seed) };
}
