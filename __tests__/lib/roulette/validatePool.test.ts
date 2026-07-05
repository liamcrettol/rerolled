import { findInvalidPoolHashes } from "@/lib/roulette/validatePool";

// #238 — the server-owned pool is the source of truth; any submitted hash not
// in it is tampering and must be flagged for rejection.
describe("findInvalidPoolHashes", () => {
  const serverPool = { kinetic: [111, 112], energy: [222], power: [333, 334] };

  it("returns nothing when the submitted pool is a subset of the server pool", () => {
    expect(
      findInvalidPoolHashes({ kinetic: [111], energy: [222], power: [333] }, serverPool),
    ).toEqual([]);
  });

  it("accepts an exact match", () => {
    expect(findInvalidPoolHashes(serverPool, serverPool)).toEqual([]);
  });

  it("flags a hash that is not in the server pool for that slot", () => {
    const invalid = findInvalidPoolHashes(
      { kinetic: [111, 999], energy: [222], power: [333] },
      serverPool,
    );
    expect(invalid).toEqual([{ slot: "kinetic", hash: 999 }]);
  });

  it("flags a valid hash submitted in the wrong slot", () => {
    // 333 is a power weapon; submitting it as kinetic is not allowed.
    const invalid = findInvalidPoolHashes(
      { kinetic: [333], energy: [222], power: [333] },
      serverPool,
    );
    expect(invalid).toEqual([{ slot: "kinetic", hash: 333 }]);
  });

  it("flags every tampered hash across slots", () => {
    const invalid = findInvalidPoolHashes(
      { kinetic: [999], energy: [888], power: [777] },
      serverPool,
    );
    expect(invalid).toEqual([
      { slot: "kinetic", hash: 999 },
      { slot: "energy", hash: 888 },
      { slot: "power", hash: 777 },
    ]);
  });

  it("treats an empty server pool as allowing nothing", () => {
    const invalid = findInvalidPoolHashes(
      { kinetic: [111], energy: [], power: [] },
      { kinetic: [], energy: [], power: [] },
    );
    expect(invalid).toEqual([{ slot: "kinetic", hash: 111 }]);
  });
});
