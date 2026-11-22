// rng.js — seeded deterministic randomness (sfc32) for the whole game.
export function hashSeed(value) {
  let h = 2166136261 >>> 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sfc32(seed) {
  let a = seed >>> 0;
  let b = (seed ^ 0x9e3779b9) >>> 0;
  let c = (seed ^ 0x85ebca6b) >>> 0;
  let d = (seed ^ 0xc2b2ae35) >>> 0;
  return function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function mulberry32(seed) {
  return sfc32(seed);
}

export function makeRng(seed) {
  const next = sfc32(typeof seed === 'number' ? seed : hashSeed(seed));
  const bag = {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
    weighted(items, weights) {
      let total = 0;
      for (const w of weights) total += w;
      let roll = next() * total;
      for (let i = 0; i < items.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    bell(min, max) {
      const middle = (next() + next() + next()) / 3;
      return min + middle * (max - min);
    },
    angle() {
      return next() * Math.PI * 2;
    },
    sample(list, count) {
      return bag.shuffle(list).slice(0, Math.min(count, list.length));
    },
  };
  return bag;
}
