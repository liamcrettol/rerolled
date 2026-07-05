/** @jest-environment node */
import { applyRollRules } from "@/lib/challenges/rollRules";
import { seededRng } from "@/lib/roulette/seededRng";
import { rollLoadout } from "@/lib/roulette/intersection";
import {
  requiredWeaponTypeRule,
  bannedWeaponTypeRule,
  bannedDamageTypeRule,
  allowExoticsRule,
  requiredExoticSlotRule,
  wildcardSlotsRule,
} from "@/lib/challenges/rules";

// Small synthetic inventory: hashes are arbitrary but stable.
const details = {
  "1": { weaponType: "Sidearm", damageType: "Kinetic", tierType: 5 },
  "2": { weaponType: "Hand Cannon", damageType: "Strand", tierType: 5 },
  "3": { weaponType: "Hand Cannon", damageType: "Kinetic", tierType: 6 },
  "10": { weaponType: "Shotgun", damageType: "Solar", tierType: 5 },
  "11": { weaponType: "Fusion Rifle", damageType: "Void", tierType: 5 },
  "12": { weaponType: "Sniper Rifle", damageType: "Arc", tierType: 6 },
  "20": { weaponType: "Rocket Launcher", damageType: "Solar", tierType: 5 },
  "21": { weaponType: "Machine Gun", damageType: "Void", tierType: 5 },
};
const pools = {
  kinetic: [1, 2, 3],
  energy: [10, 11, 12],
  power: [20, 21],
};

describe("applyRollRules", () => {
  it("passes pools through untouched with no rules", () => {
    const res = applyRollRules({ pools, details, rules: [] });
    expect(res.pools).toEqual(pools);
    expect(res.wildcardSlots).toEqual([]);
    expect(res.unsatisfiable).toEqual([]);
  });

  it("hard-filters banned weapon types from every pool", () => {
    const res = applyRollRules({ pools, details, rules: [bannedWeaponTypeRule("Hand Cannon")] });
    expect(res.pools.kinetic).toEqual([1]);
    expect(res.unsatisfiable).toEqual([]);
  });

  it("hard-filters banned damage types", () => {
    const res = applyRollRules({ pools, details, rules: [bannedDamageTypeRule("Solar")] });
    expect(res.pools.energy).toEqual([11, 12]);
    expect(res.pools.power).toEqual([21]);
  });

  it("removes exotics when allow_exotics is false", () => {
    const res = applyRollRules({ pools, details, rules: [allowExoticsRule(false)] });
    expect(res.pools.kinetic).toEqual([1, 2]);
    expect(res.pools.energy).toEqual([10, 11]);
  });

  it("restricts the required exotic slot to exotics", () => {
    const res = applyRollRules({ pools, details, rules: [requiredExoticSlotRule("energy")] });
    expect(res.pools.energy).toEqual([12]);
  });

  it("pins a slot to the required weapon type so the roll must satisfy it", () => {
    const res = applyRollRules({
      pools,
      details,
      rules: [requiredWeaponTypeRule("Sidearm")],
      rng: seededRng("test"),
    });
    // Only the kinetic pool contains a Sidearm, so kinetic gets pinned.
    expect(res.pools.kinetic).toEqual([1]);
    expect(res.unsatisfiable).toEqual([]);
  });

  it("reports unsatisfiable when the inventory can't meet a requirement", () => {
    const res = applyRollRules({
      pools,
      details,
      rules: [requiredWeaponTypeRule("Trace Rifle")],
    });
    expect(res.unsatisfiable.length).toBeGreaterThan(0);
  });

  it("reports unsatisfiable when a ban empties a slot", () => {
    const res = applyRollRules({
      pools: { ...pools, power: [20] },
      details,
      rules: [bannedDamageTypeRule("Solar")],
    });
    expect(res.unsatisfiable.some((m) => m.includes("power"))).toBe(true);
  });

  it("surfaces wildcard slots without rolling them", () => {
    const res = applyRollRules({ pools, details, rules: [wildcardSlotsRule(["power"])] });
    expect(res.wildcardSlots).toEqual(["power"]);
    // Bans don't apply to wildcard slots (the player brings their own weapon).
    expect(res.pools.power).toEqual([20, 21]);
  });
});

describe("seeded rolls", () => {
  it("produces identical loadouts for identical seeds", () => {
    const a = rollLoadout(pools, details, undefined, undefined, "normal", seededRng("week1:user1:0"));
    const b = rollLoadout(pools, details, undefined, undefined, "normal", seededRng("week1:user1:0"));
    expect(a).toEqual(b);
  });

  it("produces different sequences for different seeds", () => {
    // With tiny pools single rolls can collide; compare the raw RNG streams.
    const r1 = seededRng("week1:user1:0");
    const r2 = seededRng("week1:user2:0");
    const s1 = [r1(), r1(), r1(), r1()];
    const s2 = [r2(), r2(), r2(), r2()];
    expect(s1).not.toEqual(s2);
  });
});
