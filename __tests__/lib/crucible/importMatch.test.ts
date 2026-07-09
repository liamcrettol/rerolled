import { successfulPvpPgcrWithTeams, successfulPvePgcrWithWeapons } from "@/__fixtures__/scoreAttack/pgcr";
import { importCrucibleMatch } from "@/lib/crucible/importMatch";

function fakeDb() {
  const rows: Record<string, Map<string, Record<string, unknown>>> = {};
  const keyFor = (table: string, row: Record<string, unknown>) => {
    if (table === "crucible_matches") return String(row.instance_id);
    if (table === "crucible_match_players") return `${row.instance_id}:${row.membership_id}`;
    return `${row.viewer_user_id}:${row.opponent_membership_id}:${row.instance_id}`;
  };
  return {
    rows,
    from(table: string) {
      rows[table] ??= new Map();
      return {
        async upsert(value: Record<string, unknown> | Record<string, unknown>[]) {
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
    expect([...db.rows.crucible_encounters.values()][0]).toMatchObject({
      opponent_membership_id: "4611686018429000003",
      viewer_won: true,
      mode_bucket: "control",
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
  });
});
