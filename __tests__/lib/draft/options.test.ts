import { pickCandidates, isValidPick, CANDIDATES_PER_SLOT } from "@/lib/draft/options";

describe("pickCandidates", () => {
  it("picks 3 by default from a larger pool", () => {
    const rng = sequence([0, 0, 0]); // always take the first remaining item
    const result = pickCandidates([1, 2, 3, 4, 5], undefined, rng);
    expect(result).toHaveLength(CANDIDATES_PER_SLOT);
  });

  it("never returns duplicates even if the pool has repeats", () => {
    const result = pickCandidates([7, 7, 7, 8, 9], 3, sequence([0, 0, 0]));
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns fewer than count when the pool is smaller", () => {
    const result = pickCandidates([42], 3, sequence([0]));
    expect(result).toEqual([42]);
  });

  it("returns an empty array for an empty pool", () => {
    expect(pickCandidates([], 3, sequence([]))).toEqual([]);
  });

  it("samples without replacement using the provided rng", () => {
    // rng always returns 0 -> always picks index 0 of the shrinking remaining array
    const result = pickCandidates([10, 20, 30], 3, sequence([0, 0, 0]));
    expect(result).toEqual([10, 20, 30]);
  });
});

describe("isValidPick", () => {
  it("accepts a hash that's one of the offered options", () => {
    expect(isValidPick([1, 2, 3], 2)).toBe(true);
  });

  it("rejects a hash that wasn't offered", () => {
    expect(isValidPick([1, 2, 3], 999)).toBe(false);
  });

  it("rejects anything against an empty options list", () => {
    expect(isValidPick([], 1)).toBe(false);
  });
});

/** Deterministic rng stub: returns each queued value in order, then repeats the last. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}
