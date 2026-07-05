/** @jest-environment node */
// handlers.ts transitively imports getBungieToken (→ next-auth ESM); stub it so
// the suite loads. The finalize handlers under test never call it.
jest.mock("@/lib/auth/helpers", () => ({ getBungieToken: jest.fn() }));

import { enqueueJob, claimNextJob, completeJob, failJob } from "@/lib/scoreAttack/worker/store";
import { updateLeaderboardHandler, expireRunHandler, awardBadgesHandler } from "@/lib/scoreAttack/worker/handlers";
import { processWorkerJobs } from "@/lib/scoreAttack/worker/process";

// Chainable Supabase fake that records mutations and supports rpc queues.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb({ tables = {}, rpc = {} }: { tables?: Record<string, any>; rpc?: Record<string, any> } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any = { upserts: {}, inserts: {}, updates: {}, rpc: [] };
  const db = {
    from(table: string) {
      const cfg = tables[table] ?? {};
      let countMode = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        select: (_c?: string, opts?: any) => { if (opts?.count) countMode = true; return builder; },
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: cfg.maybeSingle ?? null, error: null }),
        single: async () => ({ data: cfg.single ?? null, error: null }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: (...args: any[]) => { (calls.upserts[table] ??= []).push(args); return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert: (...args: any[]) => { (calls.inserts[table] ??= []).push(args); return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (...args: any[]) => { (calls.updates[table] ??= []).push(args); return builder; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => resolve({ error: null, data: cfg.list ?? cfg.single ?? null, count: countMode ? cfg.count ?? 0 : undefined }),
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: async (name: string, args: any) => {
      calls.rpc.push({ name, args });
      const v = rpc[name];
      const data = Array.isArray(v) ? (v.length ? v.shift() : null) : v ?? null;
      return { data, error: null };
    },
    _calls: calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return db;
}

describe("store", () => {
  it("enqueues with a derived dedupe key and ignore-duplicates", async () => {
    const db = makeDb();
    await enqueueJob({ jobType: "expire_run", runId: "r1", payload: { runId: "r1" } }, db);
    const up = db._calls.upserts.worker_jobs[0];
    expect(up[0]).toMatchObject({ job_type: "expire_run", run_id: "r1", status: "pending" });
    expect(up[0].dedupe_key).toBe('expire_run:r1:{"runId":"r1"}');
    expect(up[1]).toMatchObject({ onConflict: "dedupe_key", ignoreDuplicates: true });
  });

  it("claimNextJob returns null when the RPC is idle, a row when not", async () => {
    expect(await claimNextJob("w", 60, makeDb({ rpc: { claim_next_worker_job: null } }))).toBeNull();
    const row = await claimNextJob("w", 60, makeDb({ rpc: { claim_next_worker_job: { id: "j1", job_type: "expire_run", run_id: "r1" } } }));
    expect(row?.id).toBe("j1");
  });

  it("complete/fail call the RPCs", async () => {
    const db = makeDb();
    await completeJob("j1", db);
    await failJob("j1", new Error("boom"), null, db);
    expect(db._calls.rpc.map((c: { name: string }) => c.name)).toEqual(["complete_worker_job", "fail_worker_job"]);
  });
});

describe("handlers", () => {
  it("updateLeaderboard upserts the run's score when it beats the existing entry", async () => {
    const db = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", mode: "weekly_challenge", weekly_challenge_id: "wc1", season_id: "s1", created_by: "u1", score: 9000, scoring_breakdown: { durationSeconds: 800, deaths: 1, rolledWeaponUsageRatio: 0.9 }, compliance_status: "eligible" } },
        challenge_run_participants: { maybeSingle: { bungie_membership_id: "m1" } },
        weekly_leaderboard_entries: { maybeSingle: { score: 5000 } },
      },
    });
    await updateLeaderboardHandler({ id: "j", job_type: "update_leaderboard", run_id: "r1" } as never, db);
    const row = db._calls.upserts.weekly_leaderboard_entries[0][0];
    expect(row).toMatchObject({ weekly_challenge_id: "wc1", user_id: "u1", score: 9000, clear_time_seconds: 800, deaths: 1, rolled_weapon_usage_pct: 90 });
  });

  it("updateLeaderboard skips when the existing score is not beaten", async () => {
    const db = makeDb({
      tables: {
        challenge_runs: { maybeSingle: { id: "r1", mode: "weekly_challenge", weekly_challenge_id: "wc1", created_by: "u1", score: 4000, scoring_breakdown: {} } },
        challenge_run_participants: { maybeSingle: { bungie_membership_id: "m1" } },
        weekly_leaderboard_entries: { maybeSingle: { score: 5000 } },
      },
    });
    await updateLeaderboardHandler({ id: "j", job_type: "update_leaderboard", run_id: "r1" } as never, db);
    expect(db._calls.upserts.weekly_leaderboard_entries).toBeUndefined();
  });

  it("expireRun expires an early-state run but not a completed one", async () => {
    const early = makeDb({ tables: { challenge_runs: { maybeSingle: { id: "r1", status: "applied" } } } });
    await expireRunHandler({ id: "j", job_type: "expire_run", run_id: "r1" } as never, early);
    expect(early._calls.updates.challenge_runs[0][0]).toMatchObject({ status: "expired" });

    const done = makeDb({ tables: { challenge_runs: { maybeSingle: { id: "r1", status: "scored" } } } });
    await expireRunHandler({ id: "j", job_type: "expire_run", run_id: "r1" } as never, done);
    expect(done._calls.updates.challenge_runs).toBeUndefined();
  });

  it("awardBadges inserts nothing for a run that earns none", async () => {
    const db = makeDb({ tables: { challenge_runs: { maybeSingle: { id: "r1", status: "scored", created_by: "u1", mode: "score_attack" } }, challenge_run_participants: { maybeSingle: { bungie_membership_id: "m1" } } } });
    await awardBadgesHandler({ id: "j", job_type: "award_badges", run_id: "r1" } as never, db);
    expect(db._calls.upserts.player_badges).toBeUndefined();
  });
});

describe("processWorkerJobs", () => {
  it("claims a job, dispatches to its handler, and completes it", async () => {
    const db = makeDb({
      tables: { challenge_runs: { maybeSingle: { id: "r1", status: "created" } } },
      rpc: { claim_next_worker_job: [{ id: "j1", job_type: "expire_run", run_id: "r1" }, null] },
    });
    const result = await processWorkerJobs({ maxJobs: 5, db });
    expect(result).toMatchObject({ processed: 1, completed: 1, failed: 0 });
    expect(db._calls.rpc.some((c: { name: string }) => c.name === "complete_worker_job")).toBe(true);
    expect(db._calls.updates.challenge_runs[0][0]).toMatchObject({ status: "expired" });
  });

  it("completes an unregistered job type as a no-op without retrying", async () => {
    // All real job types are registered now; use a bogus type to exercise the
    // defensive no-op path (forward-compat for new/unknown job types).
    const db = makeDb({ rpc: { claim_next_worker_job: [{ id: "j1", job_type: "unknown_future_type", run_id: "r1" }, null] } });
    const result = await processWorkerJobs({ maxJobs: 5, db });
    expect(result).toMatchObject({ processed: 1, noHandler: 1, completed: 0, failed: 0 });
  });
});
