import { successfulPvpPgcrWithTeams, successfulPvePgcrWithWeapons } from "@/__fixtures__/scoreAttack/pgcr";
import { importCrucibleMatch } from "@/lib/crucible/importMatch";

function fakeDb(failTable?: string) {
  const rows: Record<string, Map<string, Record<string, unknown>>> = {};
  const keyFor = (table: string, row: Record<string, unknown>) => {
    if (table === "crucible_matches") return String(row.instance_id);
    if (table === "crucible_match_players") return `${row.instance_id}:${row.membership_id}`;
    if (table === "crucible_match_viewers") return `${row.viewer_user_id}:${row.instance_id}`;
    return `${row.viewer_user_id}:${row.opponent_membership_id}:${row.instance_id}`;
  };
  return {
    rows,
    from(table: string) {
      rows[table] ??= new Map();
      return {
        async upsert(value: Record<string, unknown> | Record<string, unknown>[]) {
          if (table === failTable) return { error: new Error(`${table} unavailable`) };
          for (const row of Array.isArray(value) ? value : [value]) {
            rows[table].set(keyFor(table, row), row);
          }
          return { error: null };
        },
      };
    },
  };
}

describe("importCrucibleMatch", () => {
  it("stores the match, all players, and only opposing players", async () => {
    const db = fakeDb();
    const result = await importCrucibleMatch({
      viewerUserId: "user-1",
      viewerMembershipId: "4611686018429000001",
      rawPgcr: successfulPvpPgcrWithTeams,
      activityName: "Control",
      db,
    });

    expect(result).toEqual({ imported: true, encounterCount: 1 });
    expect(db.rows.crucible_matches.size).toBe(1);
    expect(db.rows.crucible_match_players.size).toBe(3);
    expect([...db.rows.crucible_match_viewers.values()][0]).toMatchObject({
      viewer_user_id: "user-1",
      instance_id: "pgcr-200",
    });
    expect([...db.rows.crucible_encounters.values()][0]).toMatchObject({
      opponent_membership_id: "4611686018429000003",
      viewer_won: true,
      mode_bucket: "control",
    });
  });

  it("persists activity-definition mode markers for exact playlist labels", async () => {
    const db = fakeDb();
    await importCrucibleMatch({
      viewerUserId: "user-1",
      viewerMembershipId: "4611686018429000001",
      rawPgcr: successfulPvpPgcrWithTeams,
      activityName: "The Anomaly",
      activityDefModes: [69, 72],
      db,
    });

    const match = [...db.rows.crucible_matches.values()][0];
    expect(match.activity_modes).toEqual(expect.arrayContaining([69, 72]));
    expect(match.mode_bucket).toBe("competitive");
    expect([...db.rows.crucible_encounters.values()][0]).toMatchObject({
      mode_bucket: "competitive",
    });
  });

  it("is idempotent when the same PGCR is imported again", async () => {
    const db = fakeDb();
    const input = {
      viewerUserId: "user-1",
      viewerMembershipId: "4611686018429000001",
      rawPgcr: successfulPvpPgcrWithTeams,
      db,
    };
    await importCrucibleMatch(input);
    await importCrucibleMatch(input);
    expect(db.rows.crucible_encounters.size).toBe(1);
  });

  it("ignores PvE and reports where the viewer is absent", async () => {
    const db = fakeDb();
    await expect(importCrucibleMatch({
      viewerUserId: "user-1",
      viewerMembershipId: "missing",
      rawPgcr: successfulPvpPgcrWithTeams,
      db,
    })).resolves.toEqual({ imported: false, encounterCount: 0 });
    await expect(importCrucibleMatch({
      viewerUserId: "user-1",
      viewerMembershipId: "4611686018429000001",
      rawPgcr: successfulPvePgcrWithWeapons,
      db,
    })).resolves.toEqual({ imported: false, encounterCount: 0 });
  });

  it("stores teamless matches without inventing opponents", async () => {
    const db = fakeDb();
    const raw = JSON.parse(JSON.stringify(successfulPvpPgcrWithTeams)) as typeof successfulPvpPgcrWithTeams;
    for (const entry of raw.entries) delete (entry.values as { team?: unknown }).team;
    const result = await importCrucibleMatch({
      viewerUserId: "user-1",
      viewerMembershipId: "4611686018429000001",
      rawPgcr: raw,
      db,
    });
    expect(result).toEqual({ imported: true, encounterCount: 0 });
    expect(db.rows.crucible_encounters).toBeUndefined();
    expect(db.rows.crucible_match_viewers.size).toBe(1);
  });

  it("persists and classifies the director playlist for Competitive Clash", async () => {
    const db = fakeDb();
    const raw = JSON.parse(JSON.stringify(successfulPvpPgcrWithTeams)) as typeof successfulPvpPgcrWithTeams;
    raw.activityDetails.mode = 71;
    raw.activityDetails.modes = [5, 70, 12, 71];

    await importCrucibleMatch({
      viewerUserId: "user-1",
      viewerMembershipId: "4611686018429000001",
      rawPgcr: raw,
      activityName: "The Anomaly",
      directorActivityName: "Competitive: Matchmade",
      db,
    });

    const match = [...db.rows.crucible_matches.values()][0];
    expect(match.director_activity_hash).toBe(814159553);
    expect(match.mode_bucket).toBe("competitive");
    expect([...db.rows.crucible_encounters.values()][0]).toMatchObject({
      mode_bucket: "competitive",
    });
  });

  it("does not mark a viewer imported before their encounters succeed", async () => {
    const db = fakeDb("crucible_encounters");
    await expect(importCrucibleMatch({
      viewerUserId: "user-1",
      viewerMembershipId: "4611686018429000001",
      rawPgcr: successfulPvpPgcrWithTeams,
      db,
    })).rejects.toThrow("encounter upsert failed");
    expect(db.rows.crucible_match_viewers).toBeUndefined();
  });
});
