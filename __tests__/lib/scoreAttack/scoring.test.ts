/** @jest-environment node */
import { parsePvEPgcr } from "@/lib/scoreAttack/pgcr";
import { scoreAttackRun } from "@/lib/scoreAttack/scoring";
import { missingWeaponDataPgcr, successfulPvePgcrWithWeapons } from "@/__fixtures__/scoreAttack/pgcr";
import type { NormalizedPvEPgcr } from "@/lib/scoreAttack/types";

const PLAYER_ID = "4611686018429000001";

function clonePgcr(): NormalizedPvEPgcr {
  return parsePvEPgcr(successfulPvePgcrWithWeapons);
}

describe("scoreAttackRun", () => {
  it("returns a deterministic total and UI/debug breakdown", () => {
    const result = scoreAttackRun({
      pgcr: clonePgcr(),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001, 1002],
    });

    expect(result.totalScore).toBe(27636);
    expect(result.breakdown).toMatchObject({
      baseCompletionScore: 10000,
      rolledWeaponKills: 90,
      rolledWeaponKillScore: 11250,
      rolledWeaponPrecisionKills: 26,
      rolledWeaponPrecisionBonus: 910,
      durationSeconds: 720,
      timeBonus: 900,
      timePenalty: 0,
      deaths: 2,
      deathPenalty: 500,
      subtotalBeforeMultipliers: 22560,
      rolledWeaponUsageRatio: 0.9,
      rolledWeaponUsageMultiplier: 1.225,
      totalScore: 27636,
    });
  });

  it("scores zero when completion is required and the PGCR is incomplete", () => {
    const pgcr = clonePgcr();
    pgcr.completed = false;

    const result = scoreAttackRun({
      pgcr,
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.totalScore).toBe(0);
    expect(result.breakdown.notes).toContain("completion_required");
  });

  it("handles missing weapon data", () => {
    const result = scoreAttackRun({
      pgcr: parsePvEPgcr(missingWeaponDataPgcr),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.breakdown.rolledWeaponKills).toBe(0);
    expect(result.breakdown.rolledWeaponUsageRatio).toBeNull();
    expect(result.breakdown.notes).toEqual(
      expect.arrayContaining(["missing_weapon_data", "zero_rolled_weapon_kills"])
    );
  });

  it("handles missing time without a bonus or penalty", () => {
    const pgcr = clonePgcr();
    pgcr.durationSeconds = null;

    const result = scoreAttackRun({
      pgcr,
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.breakdown.timeBonus).toBe(0);
    expect(result.breakdown.timePenalty).toBe(0);
    expect(result.breakdown.notes).toContain("missing_duration");
  });

  it("handles missing death count without applying a death penalty", () => {
    const pgcr = clonePgcr();
    pgcr.players[0].deaths = null;

    const result = scoreAttackRun({
      pgcr,
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.breakdown.deathPenalty).toBe(0);
    expect(result.breakdown.notes).toContain("missing_deaths");
  });

  it("handles no weapon kills", () => {
    const pgcr = clonePgcr();
    pgcr.players[0].weapons = [];
    pgcr.players[0].weaponDataAvailable = true;

    const result = scoreAttackRun({
      pgcr,
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.breakdown.rolledWeaponKills).toBe(0);
    expect(result.breakdown.rolledWeaponUsageMultiplier).toBe(1);
    expect(result.breakdown.notes).toEqual(
      expect.arrayContaining(["no_weapon_kills", "zero_rolled_weapon_kills"])
    );
  });

  it("handles zero rolled weapon kills", () => {
    const result = scoreAttackRun({
      pgcr: clonePgcr(),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [424242],
    });

    expect(result.breakdown.rolledWeaponKills).toBe(0);
    expect(result.breakdown.rolledWeaponUsageRatio).toBe(0);
    expect(result.breakdown.notes).toContain("zero_rolled_weapon_kills");
  });
});
