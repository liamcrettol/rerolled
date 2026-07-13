/** @jest-environment node */
import { parsePvEPgcr } from "@/lib/scoreAttack/pgcr";
import { scoreAttackRun, pvpScoreAttackRun } from "@/lib/scoreAttack/scoring";
import { missingWeaponDataPgcr, successfulPvePgcrWithWeapons } from "@/__fixtures__/scoreAttack/pgcr";
import type { NormalizedPvEPgcr, NormalizedPvpPgcr, NormalizedPvpPgcrPlayer } from "@/lib/scoreAttack/types";

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

// ── pvpScoreAttackRun (#296) ─────────────────────────────────────────────────

function makePvpPlayer(overrides: Partial<NormalizedPvpPgcrPlayer> = {}): NormalizedPvpPgcrPlayer {
  return {
    membershipId: PLAYER_ID,
    membershipType: 3,
    characterIds: ["char-1"],
    kills: 10,
    assists: 2,
    deaths: 4,
    precisionKills: 3,
    superKills: 1,
    grenadeKills: 0,
    meleeKills: 1,
    weapons: [{ weaponHash: 1001, kills: 6, precisionKills: 2 }],
    weaponDataAvailable: true,
    team: 1,
    standing: 0,
    isWin: true,
    score: 4200,
    medalKeys: [],
    scoreboardValues: {},
    completed: true,
    ...overrides,
  };
}

function makePvpPgcr(overrides: Partial<NormalizedPvpPgcr> = {}, player?: NormalizedPvpPgcrPlayer): NormalizedPvpPgcr {
  return {
    kind: "pvp",
    instanceId: "999",
    activityHash: 12345,
    directorActivityHash: null,
    activityMode: null,
    activityModes: [],
    period: "2026-07-01T00:00:00Z",
    startTime: "2026-07-01T00:00:00Z",
    endTime: "2026-07-01T00:10:00Z",
    durationSeconds: 600,
    completed: true,
    players: [player ?? makePvpPlayer()],
    teams: [],
    isSupported: true,
    warnings: [],
    ...overrides,
  };
}

describe("pvpScoreAttackRun", () => {
  it("scores rolled-weapon kills, precision bonus, win bonus, and death penalty", () => {
    const result = pvpScoreAttackRun({
      pgcr: makePvpPgcr(),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    // 6 rolled kills * 150 + 2 rolled precision * 40 + 600 win bonus - 4 deaths * 40
    // = 900 + 80 + 600 - 160 = 1420. The player's only weapons[] entry IS the
    // rolled weapon, so usage ratio is 6/6 = 1.0 -> multiplier 1 + min(0.25, 1.0*0.25) = 1.25.
    expect(result.breakdown.rolledWeaponKillScore).toBe(900);
    expect(result.breakdown.rolledWeaponPrecisionBonus).toBe(80);
    expect(result.breakdown.winBonus).toBe(600);
    expect(result.breakdown.deathPenalty).toBe(160);
    expect(result.breakdown.rolledWeaponUsageMultiplier).toBeCloseTo(1.25);
    expect(result.totalScore).toBe(Math.round(1420 * 1.25));
  });

  it("awards no win bonus on a loss", () => {
    const result = pvpScoreAttackRun({
      pgcr: makePvpPgcr({}, makePvpPlayer({ isWin: false })),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.breakdown.winBonus).toBe(0);
  });

  it("is ineligible (score 0) when the player's own completed flag is false, even if the match-level pgcr.completed is true", () => {
    // Regression for the aggregate-vs-per-player bug: pgcr.completed=true
    // (some other player's entry) must NOT make this player eligible when
    // their own entry shows completed=false.
    const result = pvpScoreAttackRun({
      pgcr: makePvpPgcr({ completed: true }, makePvpPlayer({ completed: false })),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.totalScore).toBe(0);
    expect(result.breakdown.notes).toContain("completion_required");
  });

  it("is ineligible when the match is shorter than the minimum duration (anti-cheese)", () => {
    const result = pvpScoreAttackRun({
      pgcr: makePvpPgcr({ durationSeconds: 30 }),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.totalScore).toBe(0);
    expect(result.breakdown.notes).toContain("match_too_short");
  });

  it("is ineligible when there are zero rolled-weapon kills, even with a win (anti-cheese: a win alone can't carry the score)", () => {
    const result = pvpScoreAttackRun({
      pgcr: makePvpPgcr({}, makePvpPlayer({ isWin: true })),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [999999], // doesn't match the player's weapon
    });

    expect(result.totalScore).toBe(0);
    expect(result.breakdown.notes).toContain("rolled_weapon_kill_required");
  });

  it("clamps the score at 0 when the death penalty would otherwise take it negative", () => {
    const result = pvpScoreAttackRun({
      pgcr: makePvpPgcr({}, makePvpPlayer({ isWin: false, deaths: 500, weapons: [{ weaponHash: 1001, kills: 1, precisionKills: 0 }] })),
      playerMembershipId: PLAYER_ID,
      rolledWeaponHashes: [1001],
    });

    expect(result.totalScore).toBe(0);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
  });

  it("returns a zeroed breakdown when the player isn't found in the PGCR", () => {
    const result = pvpScoreAttackRun({
      pgcr: makePvpPgcr(),
      playerMembershipId: "not-in-match",
      rolledWeaponHashes: [1001],
    });

    expect(result.totalScore).toBe(0);
    expect(result.breakdown.notes).toContain("player_not_found");
  });
});
