/** @jest-environment node */
import {
  getActivityPool,
  pickWeeklyActivity,
  getActivityKindByHash,
  getActivityDifficultyMultiplier,
} from "@/lib/scoreAttack/activityPool";

describe("Score Attack activity pool", () => {
  it("uses a broad PvE pool instead of the old tiny placeholder list", () => {
    const pvePool = getActivityPool({ pillar: "pve" });

    expect(pvePool.length).toBeGreaterThanOrEqual(25);
    expect(pvePool.some((activity) => activity.kind === "raid")).toBe(true);
    expect(pvePool.some((activity) => activity.kind === "dungeon")).toBe(true);
    expect(pvePool.some((activity) => activity.kind === "grandmaster")).toBe(true);
  });

  it("keeps PvP activities available as their own section of the catalog", () => {
    const pvpPool = getActivityPool({ pillar: "pvp" });

    expect(pvpPool.length).toBeGreaterThanOrEqual(8);
    expect(pvpPool.map((activity) => activity.kind)).toEqual(
      expect.arrayContaining(["crucible", "trials", "iron-banner"])
    );
  });

  it("selects weekly activities deterministically for the same reset week", () => {
    const first = pickWeeklyActivity(new Date("2026-07-08T12:00:00.000Z"));
    const second = pickWeeklyActivity(new Date("2026-07-10T12:00:00.000Z"));

    expect(second).toEqual(first);
  });

  it("resolves an activity's kind and difficulty multiplier from its hash (#272)", () => {
    const grandmaster = getActivityPool({ pillar: "pve", kinds: ["grandmaster"] })[0];
    const raid = getActivityPool({ pillar: "pve", kinds: ["raid"] })[0];
    const crucible = getActivityPool({ pillar: "pvp", kinds: ["crucible"] })[0];

    expect(getActivityKindByHash(grandmaster.activityHashes[0])).toBe("grandmaster");
    expect(getActivityDifficultyMultiplier(grandmaster.activityHashes[0])).toBeGreaterThan(
      getActivityDifficultyMultiplier(raid.activityHashes[0])
    );
    expect(getActivityDifficultyMultiplier(raid.activityHashes[0])).toBeGreaterThan(
      getActivityDifficultyMultiplier(crucible.activityHashes[0])
    );
  });

  it("defaults an unknown or missing activity hash to a 1x (no-op) multiplier", () => {
    expect(getActivityKindByHash(999999999)).toBeNull();
    expect(getActivityDifficultyMultiplier(999999999)).toBe(1);
    expect(getActivityDifficultyMultiplier(null)).toBe(1);
    expect(getActivityDifficultyMultiplier(undefined)).toBe(1);
  });
});
