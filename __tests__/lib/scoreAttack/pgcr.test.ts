/** @jest-environment node */
import { parsePvEPgcr } from "@/lib/scoreAttack/pgcr";
import {
  incompleteUnsupportedPgcr,
  missingWeaponDataPgcr,
  multiCharacterPgcr,
  successfulPvePgcrWithWeapons,
} from "@/__fixtures__/scoreAttack/pgcr";

describe("parsePvEPgcr", () => {
  it("normalizes a successful PvE completion with weapon data", () => {
    const pgcr = parsePvEPgcr(successfulPvePgcrWithWeapons);

    expect(pgcr).toMatchObject({
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
