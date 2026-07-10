/** @jest-environment node */
import { parsePgcr, parsePvpPgcr, parsePvEPgcr } from "@/lib/scoreAttack/pgcr";
import {
  incompleteUnsupportedPgcr,
  missingWeaponDataPgcr,
  multiCharacterPgcr,
  successfulPvePgcrWithWeapons,
  successfulPvpPgcrWithTeams,
} from "@/__fixtures__/scoreAttack/pgcr";

describe("parsePvEPgcr", () => {
  it("normalizes a successful PvE completion with weapon data", () => {
    const pgcr = parsePvEPgcr(successfulPvePgcrWithWeapons);

    expect(pgcr).toMatchObject({
      kind: "pve",
      instanceId: "pgcr-100",
      activityHash: 123456,
      activityMode: 4,
      activityModes: [4, 7],
      period: "2026-07-05T18:00:00Z",
      startTime: "2026-07-05T18:00:00Z",
      endTime: "2026-07-05T18:12:00.000Z",
      durationSeconds: 720,
      completed: true,
      isSupported: true,
    });

    const player = pgcr.players.find((entry) => entry.membershipId === "4611686018429000001");
    expect(player).toMatchObject({
      membershipType: 3,
      displayName: "RunnerOne",
      characterIds: ["char-alpha"],
      kills: 100,
      assists: 20,
      deaths: 2,
      precisionKills: 30,
      superKills: 7,
      grenadeKills: 5,
      meleeKills: 4,
      weaponDataAvailable: true,
    });
    expect(player?.weapons).toEqual([
      { weaponHash: 1001, kills: 70, precisionKills: 20, weaponType: "Auto Rifle" },
      { weaponHash: 1002, kills: 20, precisionKills: 6, weaponType: "Sidearm" },
      { weaponHash: 9001, kills: 10, precisionKills: 0, weaponType: "Grenade Launcher" },
    ]);
  });

  it("handles missing weapon data without throwing", () => {
    const pgcr = parsePvEPgcr(missingWeaponDataPgcr);
    const player = pgcr.players[0];

    expect(pgcr.isSupported).toBe(true);
    expect(player.weaponDataAvailable).toBe(false);
    expect(player.weapons).toEqual([]);
  });

  it("marks incomplete unsupported payloads with no entries", () => {
    const pgcr = parsePvEPgcr(incompleteUnsupportedPgcr);

    expect(pgcr.isSupported).toBe(false);
    expect(pgcr.unsupportedReason).toBe("no_entries");
    expect(pgcr.completed).toBe(false);
    expect(pgcr.players).toEqual([]);
  });

  it("aggregates multi-character entries for the same player", () => {
    const pgcr = parsePvEPgcr(multiCharacterPgcr);

    expect(pgcr.players).toHaveLength(1);
    expect(pgcr.players[0]).toMatchObject({
      membershipId: "4611686018429000001",
      characterIds: ["char-alpha", "char-beta"],
      kills: 15,
      deaths: 1,
      weaponDataAvailable: true,
    });
    expect(pgcr.players[0].weapons).toEqual([
      { weaponHash: 1001, kills: 10, precisionKills: 3 },
      { weaponHash: 1003, kills: 2, precisionKills: 0 },
    ]);
  });
});

describe("parsePvpPgcr", () => {
  it("normalizes team-based PvP PGCRs instead of rejecting them", () => {
    const pgcr = parsePvpPgcr(successfulPvpPgcrWithTeams);

    expect(pgcr).toMatchObject({
      kind: "pvp",
      instanceId: "pgcr-200",
      activityHash: 654321,
      activityMode: 10,
      activityModes: [5, 10],
      durationSeconds: 600,
      completed: true,
      isSupported: true,
      teams: [
        { teamId: 1, standing: 0, score: 150, teamName: "Alpha" },
        { teamId: 2, standing: 1, score: 90, teamName: "Bravo" },
      ],
    });

    const player = pgcr.players.find((entry) => entry.membershipId === "4611686018429000001");
    expect(player).toMatchObject({
      team: 1,
      standing: 0,
      isWin: true,
      score: 150,
      kills: 28,
      deaths: 0,
      medalKeys: ["seventh_column"],
      scoreboardValues: { captures: 5, seventh_column: 1 },
    });
  });

  it("auto-detects PvP payloads via parsePgcr", () => {
    const pgcr = parsePgcr(successfulPvpPgcrWithTeams);
    expect(pgcr.kind).toBe("pvp");
    expect(pgcr.players).toHaveLength(3);
  });

  it("prefers the cross-platform Bungie global name over a stale platform name", () => {
    const raw = structuredClone(successfulPvpPgcrWithTeams);
    raw.entries[0].player.destinyUserInfo.displayName = "Equinox8585";
    (raw.entries[0].player.destinyUserInfo as typeof raw.entries[0]["player"]["destinyUserInfo"] & { bungieGlobalDisplayName: string }).bungieGlobalDisplayName = "♡VΛLΣ♡";

    const pgcr = parsePvpPgcr(raw);

    expect(pgcr.players[0].displayName).toBe("♡VΛLΣ♡");
  });

  it("tracks completion per-player, not as a whole-match aggregate (#296)", () => {
    // One player finished the match, the other left early - a real scenario
    // readCompleted()'s old aggregate (`.every()` across all entries) would
    // have reported completed=false for BOTH players. Each player's own
    // NormalizedPvpPgcrPlayer.completed must reflect only their own entry.
    const mixedCompletion = {
      period: "2026-07-05T20:00:00Z",
      activityDetails: { instanceId: "pgcr-201", referenceId: 654321, mode: 10, modes: [5, 10] },
      teams: [],
      entries: [
        {
          characterId: "char-finished",
          player: { destinyUserInfo: { membershipId: "1111", membershipType: 3 } },
          values: {
            kills: { basic: { value: 10 } },
            deaths: { basic: { value: 2 } },
            team: { basic: { value: 1 } },
            standing: { basic: { value: 0 } },
            completed: { basic: { value: 1 } },
          },
        },
        {
          characterId: "char-left-early",
          player: { destinyUserInfo: { membershipId: "2222", membershipType: 3 } },
          values: {
            kills: { basic: { value: 3 } },
            deaths: { basic: { value: 1 } },
            team: { basic: { value: 2 } },
            standing: { basic: { value: 1 } },
            completed: { basic: { value: 0 } },
          },
        },
      ],
    };

    const pgcr = parsePvpPgcr(mixedCompletion);
    const finished = pgcr.players.find((p) => p.membershipId === "1111");
    const leftEarly = pgcr.players.find((p) => p.membershipId === "2222");

    expect(finished?.completed).toBe(true);
    expect(leftEarly?.completed).toBe(false);
  });
});
