import {
  detectMercyOrLargeMargin,
  finalizationPrerequisitesReady,
} from "@/lib/scoreAttack/worker/automaticHandlers";
import type { NormalizedPvpPgcr, NormalizedPvpPgcrPlayer } from "@/lib/scoreAttack/types";

function player(overrides: Partial<NormalizedPvpPgcrPlayer> = {}): NormalizedPvpPgcrPlayer {
  return {
    membershipId: "member-1",
    membershipType: 3,
    displayName: "Guardian",
    characterIds: ["character-1"],
    kills: 20,
    assists: 5,
    deaths: 3,
    precisionKills: 4,
    superKills: 1,
    grenadeKills: 1,
    meleeKills: 1,
    weapons: [],
    weaponDataAvailable: true,
    team: 1,
    standing: 0,
    isWin: true,
    score: 150,
    medalKeys: [],
    scoreboardValues: {},
    completed: true,
    ...overrides,
  };
}

function pgcr(ownScore: number, opponentScore: number): NormalizedPvpPgcr {
  const current = player();
  return {
    kind: "pvp",
    instanceId: "instance-1",
    activityHash: 1,
    activityMode: 10,
    activityModes: [10],
    period: "2026-07-10T00:00:00.000Z",
    startTime: "2026-07-10T00:00:00.000Z",
    endTime: "2026-07-10T00:10:00.000Z",
    durationSeconds: 600,
    completed: true,
    players: [current],
    teams: [
      { teamId: 1, standing: 0, score: ownScore },
      { teamId: 2, standing: 1, score: opponentScore },
    ],
    isSupported: true,
    warnings: [],
  };
}

describe("automatic badge pipeline", () => {
  describe("finalizationPrerequisitesReady", () => {
    it("requires score, compliance, and one legality row per participant", () => {
      expect(
        finalizationPrerequisitesReady(
          { score: 100, compliance_status: "eligible" },
          ["user-1", "user-2"],
          ["user-1", "user-2"],
        ),
      ).toBe(true);
    });

    it("stays blocked while any participant legality row is missing", () => {
      expect(
        finalizationPrerequisitesReady(
          { score: 100, compliance_status: "eligible" },
          ["user-1", "user-2"],
          ["user-1"],
        ),
      ).toBe(false);
    });

    it("stays blocked before score or compliance is persisted", () => {
      expect(
        finalizationPrerequisitesReady(
          { score: null, compliance_status: "eligible" },
          ["user-1"],
          ["user-1"],
        ),
      ).toBe(false);
      expect(
        finalizationPrerequisitesReady(
          { score: 100, compliance_status: null },
          ["user-1"],
          ["user-1"],
        ),
      ).toBe(false);
    });
  });

  describe("detectMercyOrLargeMargin", () => {
    it("detects a 50-point winning margin", () => {
      const report = pgcr(150, 100);
      expect(detectMercyOrLargeMargin(report, report.players[0])).toBe(true);
    });

    it("detects a 50-percent winning score ratio", () => {
      const report = pgcr(120, 70);
      expect(detectMercyOrLargeMargin(report, report.players[0])).toBe(true);
    });

    it("does not flag an ordinary close win", () => {
      const report = pgcr(150, 120);
      expect(detectMercyOrLargeMargin(report, report.players[0])).toBe(false);
    });

    it("returns null when the player did not win", () => {
      const report = pgcr(150, 80);
      const losingPlayer = player({ isWin: false });
      expect(detectMercyOrLargeMargin(report, losingPlayer)).toBeNull();
    });
  });
});
