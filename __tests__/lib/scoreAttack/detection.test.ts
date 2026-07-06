/** @jest-environment node */
import {
  fetchPgcrHandler,
  parsePgcrHandler,
  computeScoreHandler,
  computeComplianceHandler,
  computeLegalityHandler,
  pollActivityHistoryHandler,
  captureTrialsPassageSnapshotHandler,
} from "@/lib/scoreAttack/worker/detection";
import { syncPlayerStats } from "@/lib/scoreAttack/worker/stats";
import { parsePvEPgcr } from "@/lib/scoreAttack/pgcr";
import { successfulPvePgcrWithWeapons } from "@/__fixtures__/scoreAttack/pgcr";

const PLAYER = "4611686018429000001";
const TEAMMATE = "4611686018429000002";
const normalized = parsePvEPgcr(successfulPvePgcrWithWeapons);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb({ tables = {} }: { tables?: Record<string, any> } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any = { upserts: {}, inserts: {}, updates: {} };
  const db = {
    from(table: string) {
      const cfg = tables[table] ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: cfg.maybeSingle ?? null, error: null }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: (...a: any[]) => { (calls.upserts[table] ??= []).push(a); return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert: (...a: any[]) => { (calls.inserts[table] ??= []).push(a); return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (...a: any[]) => { (calls.updates[table] ??= []).push(a); return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (r: any) => r({ error: null, data: cfg.list ?? null, count: cfg.count ?? 0 }),
      };
      return builder;
    },
    _calls: calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return db;
}

jest.mock("@/lib/auth/helpers", () => ({ getBungieToken: jest.fn() }));

const enqueued: Array<{ jobType: string; payload: unknown }> = [];
jest.mock("@/lib/scoreAttack/worker/store", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enqueueJob: async (input: any) => { enqueued.push({ jobType: input.jobType, payload: input.payload }); },
}));

beforeEach(() => { enqueued.length = 0; });

const job = (payload: unknown) => ({ id: "j", job_type: "x", run_id: "r1", payload } as never);
const ownerRow = { user_id: "u1", bungie_membership_id: PLAYER, bungie_membership_type: 3, character_id: "char-1" };

describe("fetchPgcrHandler", () => {
  it("caches the raw PGCR and enqueues parse", async () => {
    const db = makeDb();
    const client = { get: jest.fn(), fetchPgcr: jest.fn().mockResolvedValue(successfulPvePgcrWithWeapons) };
    await fetchPgcrHandler(job({ runId: "r1", instanceId: "pgcr-100" }), { db, client });
    expect(db._calls.upserts.pgcr_cache[0][0]).toMatchObject({ instance_id: "pgcr-100", status: "fetched" });
    expect(enqueued.map((e) => e.jobType)).toContain("parse_pgcr");
  });
});

describe("parsePgcrHandler", () => {
  it("normalizes the cached PGCR and fans out to score + compliance + legality", async () => {
    const db = makeDb({
      tables: {
        pgcr_cache: { maybeSingle: { raw_pgcr: successfulPvePgcrWithWeapons } },
        challenge_runs: { maybeSingle: { id: "r1", created_by: "u1" } },
        challenge_run_participants: { maybeSingle: ownerRow },
      },
    });
    await parsePgcrHandler(job({ runId: "r1", instanceId: "pgcr-100" }), { db });
    expect(db._calls.updates.pgcr_cache[0][0]).toMatchObject({ status: "normalized" });
    expect(enqueued.map((e) => e.jobType).sort()).toEqual([
      "capture_trials_passage_snapshot",
      "compute_compliance",
      "compute_legality",
      "compute_score",
    ]);
  });
});

describe("captureTrialsPassageSnapshotHandler", () => {
  it("stores derived Trials passage snapshots from profile objectives", async () => {
    const db = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", created_by: "u1" } },
        challenge_run_participants: { maybeSingle: ownerRow },
      },
    });
    const client = {
      fetchPgcr: jest.fn(),
      get: jest.fn().mockResolvedValue({
        characters: { data: {} },
        characterInventories: {
          data: {
            "char-1": {
              items: [
                {
                  itemHash: 3125852681,
                  itemInstanceId: "passage-1",
                  quantity: 1,
                  bindStatus: 0,
                  location: 1,
                  bucketHash: 1345459588,
                  transferStatus: 0,
                  lockable: false,
                  state: 0,
                },
              ],
            },
          },
        },
        characterEquipment: { data: {} },
        profileInventory: { data: { items: [] } },
        itemComponents: {
          instances: { data: {} },
          objectives: {
            data: {
              "passage-1": {
                objectives: [
                  { objectiveHash: 1586211619, progress: 2, completionValue: 7, complete: false, visible: true },
                  { objectiveHash: 2369244651, progress: 0, completionValue: 1, complete: false, visible: true },
                  { objectiveHash: 984122744, progress: 9, completionValue: 1, complete: true, visible: true },
                ],
              },
            },
          },
          sockets: { data: {} },
          reusablePlugs: { data: {} },
        },
      }),
    };
    await captureTrialsPassageSnapshotHandler(
      job({ runId: "r1", membershipId: PLAYER, membershipType: 3, characterId: "char-1", capturePhase: "pre_match" }),
      { db, client, tokenFor: async () => "token" },
    );

    const rows = db._calls.upserts.run_trials_passage_snapshots[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      run_id: "r1",
      capture_phase: "pre_match",
      passage_item_hash: 3125852681,
      wins: 2,
      rounds_won: 9,
      is_flawless: false,
      is_complete: false,
    });
  });
});

describe("computeScoreHandler", () => {
  it("scores a completed run and enqueues the finalize handlers", async () => {
    const db = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", pgcr_instance_id: "pgcr-100", created_by: "u1" } },
        pgcr_cache: { maybeSingle: { normalized_pgcr: normalized } },
        challenge_run_loadout_slots: { list: [{ slot: "kinetic", item_hash: 1001, weapon_type: "Sidearm", is_wildcard: false }] },
      },
    });
    await computeScoreHandler(job({ runId: "r1", playerMembershipId: PLAYER }), { db });
    const update = db._calls.updates.challenge_runs[0][0];
    expect(update.status).toBe("scored");
    expect(typeof update.score).toBe("number");
    expect(update.score).toBeGreaterThan(0);
    expect(enqueued.map((e) => e.jobType).sort()).toEqual(["award_badges", "update_leaderboard"]);
  });

  it("scores a grandmaster run higher than an otherwise-identical run with no known activity (#272)", async () => {
    const dbNoActivity = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", pgcr_instance_id: "pgcr-100", created_by: "u1", activity_hash: null } },
        pgcr_cache: { maybeSingle: { normalized_pgcr: normalized } },
        challenge_run_loadout_slots: { list: [{ slot: "kinetic", item_hash: 1001, weapon_type: "Sidearm", is_wildcard: false }] },
      },
    });
    const dbGrandmaster = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", pgcr_instance_id: "pgcr-100", created_by: "u1", activity_hash: 373475104 } },
        pgcr_cache: { maybeSingle: { normalized_pgcr: normalized } },
        challenge_run_loadout_slots: { list: [{ slot: "kinetic", item_hash: 1001, weapon_type: "Sidearm", is_wildcard: false }] },
      },
    });

    await computeScoreHandler(job({ runId: "r1", playerMembershipId: PLAYER }), { db: dbNoActivity });
    await computeScoreHandler(job({ runId: "r1", playerMembershipId: PLAYER }), { db: dbGrandmaster });

    const baseScore = dbNoActivity._calls.updates.challenge_runs[0][0].score;
    const gmScore = dbGrandmaster._calls.updates.challenge_runs[0][0].score;
    expect(gmScore).toBeGreaterThan(baseScore);
  });
});

describe("computeComplianceHandler", () => {
  it("writes a compliance verdict and stamps the run", async () => {
    const db = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", pgcr_instance_id: "pgcr-100", created_by: "u1" } },
        pgcr_cache: { maybeSingle: { normalized_pgcr: normalized } },
        challenge_run_loadout_slots: { list: [{ slot: "kinetic", item_hash: 1001, weapon_type: "Sidearm", is_wildcard: false }] },
        run_equipment_snapshots: { list: [] },
      },
    });
    await computeComplianceHandler(job({ runId: "r1", playerMembershipId: PLAYER }), { db });
    const result = db._calls.upserts.run_compliance_results[0][0];
    expect(result).toMatchObject({ run_id: "r1", bungie_membership_id: PLAYER });
    expect(typeof result.status).toBe("string");
    expect(db._calls.updates.challenge_runs[0][0]).toHaveProperty("compliance_status");
  });
});

describe("computeLegalityHandler", () => {
  it("writes strict legality rows for every run participant", async () => {
    const db = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", pgcr_instance_id: "pgcr-100", created_by: "u1" } },
        pgcr_cache: { maybeSingle: { normalized_pgcr: normalized } },
        challenge_run_loadout_slots: { list: [{ slot: "kinetic", item_hash: 1001, weapon_type: "Auto Rifle", is_wildcard: false }] },
        challenge_run_participants: {
          list: [
            { user_id: "u1", bungie_membership_id: PLAYER },
            { user_id: "u2", bungie_membership_id: TEAMMATE },
          ],
        },
      },
    });
    await computeLegalityHandler(job({ runId: "r1" }), { db });
    const rows = db._calls.upserts.run_legality_results[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ run_id: "r1", user_id: "u1", is_valid: false, illegal_final_blows: 46 });
    expect(rows[1]).toMatchObject({ run_id: "r1", user_id: "u2", is_valid: true, illegal_final_blows: 0 });
  });
});

describe("syncPlayerStats", () => {
  it("recomputes and upserts season + lifetime aggregates", async () => {
    const db = makeDb({
      tables: {
        challenge_runs: { count: 5 },
        weekly_leaderboard_entries: { maybeSingle: { score: 9000, rank: 3 } },
      },
    });
    await syncPlayerStats({ userId: "u1", seasonId: "s1" }, db);
    const season = db._calls.upserts.player_season_stats[0][0];
    expect(season).toMatchObject({ user_id: "u1", season_id: "s1", total_runs: 5, best_weekly_score: 9000, best_weekly_rank: 3 });
    const lifetime = db._calls.upserts.player_lifetime_stats[0][0];
    expect(lifetime).toMatchObject({ user_id: "u1", total_runs: 5 });
  });

  it("skips season stats when there is no active season", async () => {
    const db = makeDb({ tables: { challenge_runs: { count: 2 } } });
    await syncPlayerStats({ userId: "u1", seasonId: null }, db);
    expect(db._calls.upserts.player_season_stats).toBeUndefined();
    expect(db._calls.upserts.player_lifetime_stats[0][0]).toMatchObject({ user_id: "u1", total_runs: 2 });
  });
});

describe("pollActivityHistoryHandler", () => {
  const runRow = { id: "r1", created_by: "u1", activity_hash: 3849697860, status: "in_activity", started_at: new Date().toISOString() };

  it("marks completion and enqueues fetch when a matching activity is found", async () => {
    const db = makeDb({ tables: { challenge_runs: { maybeSingle: runRow }, challenge_run_participants: { maybeSingle: ownerRow } } });
    const client = {
      fetchPgcr: jest.fn(),
      get: jest.fn().mockResolvedValue({
        activities: [{ period: new Date().toISOString(), activityDetails: { instanceId: "pgcr-100", directorActivityHash: 3849697860 }, values: { completed: { basic: { value: 1 } } } }],
      }),
    };
    await pollActivityHistoryHandler(job({ runId: "r1", membershipId: PLAYER, membershipType: 3, characterId: "char-1", appliedAt: new Date(Date.now() - 1000).toISOString() }), { db, client });
    expect(db._calls.updates.challenge_runs[0][0]).toMatchObject({
      activity_hash: 3849697860,
      pgcr_instance_id: "pgcr-100",
      status: "completed_pending_pgcr",
    });
    expect(enqueued.map((e) => e.jobType)).toContain("fetch_pgcr");
  });

  it("reschedules itself when nothing has completed yet", async () => {
    const db = makeDb({ tables: { challenge_runs: { maybeSingle: runRow }, challenge_run_participants: { maybeSingle: ownerRow } } });
    const client = { fetchPgcr: jest.fn(), get: jest.fn().mockResolvedValue({ activities: [] }) };
    await pollActivityHistoryHandler(job({ runId: "r1", membershipId: PLAYER, membershipType: 3, characterId: "char-1" }), { db, client });
    expect(db._calls.updates.challenge_runs).toBeUndefined();
    expect(enqueued.map((e) => e.jobType)).toContain("poll_activity_history");
  });
});

