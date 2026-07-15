import { planWeaponCycles, type WeaponUsageRow } from "@/lib/roulette/weaponCycle";

const pools = {
  kinetic: [101, 102, 103],
  energy: [201, 202],
  power: [301],
};

function usage(slot: WeaponUsageRow["slot"], item_hash: number, index: number): WeaponUsageRow {
  return { slot, item_hash, used_at: new Date(2026, 0, 1, 0, 0, index).toISOString() };
}

describe("planWeaponCycles", () => {
  it("removes every weapon already used in the lobby cycle", () => {
    const plan = planWeaponCycles(pools, [usage("kinetic", 102, 2), usage("kinetic", 101, 1)]);

    expect(plan.pools.kinetic).toEqual([103]);
    expect(plan.pools.energy).toEqual([201, 202]);
    expect(plan.resets).toEqual({});
  });

  it("starts a new cycle only after the slot pool is exhausted", () => {
    const plan = planWeaponCycles(pools, [
      usage("kinetic", 103, 3),
      usage("kinetic", 102, 2),
      usage("kinetic", 101, 1),
    ]);

    expect(plan.resets.kinetic).toEqual({ retainHash: 103 });
    expect(plan.pools.kinetic).toEqual([101, 102]);
  });

  it("allows the only weapon in a slot to repeat after exhaustion", () => {
    const plan = planWeaponCycles(pools, [usage("power", 301, 1)]);

    expect(plan.resets.power).toEqual({ retainHash: null });
    expect(plan.pools.power).toEqual([301]);
  });

  it("ignores usage for weapons outside the current eligible pool", () => {
    const plan = planWeaponCycles(pools, [usage("energy", 999, 1)]);

    expect(plan.pools.energy).toEqual([201, 202]);
    expect(plan.resets.energy).toBeUndefined();
  });

  it("deduplicates repeated hashes in a submitted pool", () => {
    const plan = planWeaponCycles({ ...pools, kinetic: [101, 101, 102] }, []);
    expect(plan.pools.kinetic).toEqual([101, 102]);
  });
});
