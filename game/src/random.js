// Seeded randomness for Vice Harbor: the same seed always builds the same city and the same
// staged screenshots. A tiny integer hash (mulberry32-style) is all this needs.
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one entry from an array with the seeded random. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** A number in [min, max) from the seeded random. */
export function range(random, min, max) {
  return min + random() * (max - min);
}
