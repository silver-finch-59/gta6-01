// Solmar Bay — deterministic dice. Every random choice in the city, the
// traffic and the missions comes from one seeded stream, so a fixed seed
// rebuilds the exact same world and the screenshot scenes replay frame for
// frame. The core is a small 32-bit generator (sfc32) with a string-hash
// seeder, wrapped in a friendly bag of helpers that game code actually uses.
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

// Backwards-friendly alias: older code asked for a mulberry-style stream by
// name. It now returns the same sfc32 stream the rest of the game uses.
export function mulberry32(seed) {
  return sfc32(seed);
}

export function makeRng(seed) {
  const next = sfc32(typeof seed === 'number' ? seed : hashSeed(seed));
  const bag = {
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Whole number in [min, max], inclusive on both ends.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    // One element of a list, uniformly at random.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // True with probability p (0..1).
    chance(p) {
      return next() < p;
    },
    // Minus one or plus one, fifty-fifty.
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
    // One element, weighted by the matching entry of weights.
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
    // A fresh array with the same elements in random order.
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
    // Bell-curved value around the middle of [min, max]: the average of
    // three draws, so extremes are rarer than middles.
    bell(min, max) {
      const middle = (next() + next() + next()) / 3;
      return min + middle * (max - min);
    },
    // An angle in radians, uniformly around the circle.
    angle() {
      return next() * Math.PI * 2;
    },
    // A few distinct elements of a list, in random order.
    sample(list, count) {
      return bag.shuffle(list).slice(0, Math.min(count, list.length));
    },
  };
  return bag;
}
