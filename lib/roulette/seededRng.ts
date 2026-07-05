// Deterministic RNG for seeded rolls (weekly challenges). xmur3 string hash
// feeding mulberry32 — tiny, fast, and stable across platforms. Weekly rolls
// seed with `${global_seed}:${userId}:${rerollIndex}` so a player's roll for a
// given week is reproducible (abandoning and restarting a run re-rolls the
// same guns) while still differing per player and per reroll.

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a deterministic `() => number` in [0, 1) from a string seed. */
export function seededRng(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}
