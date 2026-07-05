// Worker job handlers (#255, finalize path).
//
// Implemented here: the "results" half of the pipeline — turning a scored run
// into leaderboard standings, badges, and terminal state. These are pure DB
// transforms over an injectable client, so they're unit-testable and their
// writes were validated against the live schema.
//
// The Bungie-facing half (capture_equipment_snapshot / poll_activity_history /
// fetch_pgcr / parse_pgcr / compute_score / compute_compliance) needs live
// Bungie data + real play to verify and is intentionally NOT registered yet —
// the runner treats unregistered types as a logged no-op rather than churning
// retries. Those handlers are the next increment (#247/#248/#254 wiring).

import { adminSupabase } from "@/lib/supabase/admin";
import { evaluateBadges, buildPlayerBadgeInsert } from "@/lib/badges/evaluators";
import {
  captureEquipmentSnapshotHandler,
  pollActivityHistoryHandler,
  fetchPgcrHandler,
  parsePgcrHandler,
  computeScoreHandler,
  computeComplianceHandler,
} from "./detection";
import type { WorkerJobRow } from "./store";
import type { ScoreAttackJobType } from "./jobs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
export type JobHandler = (job: WorkerJobRow, db: Db) => Promise<void>;

/** Score → leaderboard standings (best entry per user per challenge). */
export const updateLeaderboardHandler: JobHandler = async (job, db) => {
  const { data: run } = await db
    .from("challenge_runs")
    .select("id, mode, weekly_challenge_id, season_id, created_by, score, scoring_breakdown, compliance_status")
    .eq("id", job.run_id)
    .maybeSingle();

  if (!run || run.mode !== "weekly_challenge" || !run.weekly_challenge_id || run.score == null || !run.created_by) {
    return;
  }

  const { data: participant } = await db
    .from("challenge_run_participants")
    .select("bungie_membership_id")
    .eq("run_id", run.id)
    .eq("user_id", run.created_by)
    .maybeSingle();

  const breakdown = run.scoring_breakdown ?? {};
  const usageRatio = breakdown.rolledWeaponUsageRatio;

  // Keep only the user's best score for the challenge.
  const { data: existing } = await db
    .from("weekly_leaderboard_entries")
    .select("score")
    .eq("weekly_challenge_id", run.weekly_challenge_id)
    .eq("user_id", run.created_by)
    .maybeSingle();
  if (existing && Number(existing.score) >= Number(run.score)) return;

  await db.from("weekly_leaderboard_entries").upsert(
    {
      weekly_challenge_id: run.weekly_challenge_id,
      season_id: run.season_id,
      run_id: run.id,
      user_id: run.created_by,
      bungie_membership_id: participant?.bungie_membership_id ?? "unknown",
      score: run.score,
      clear_time_seconds: breakdown.durationSeconds ?? null,
      deaths: breakdown.deaths ?? null,
      rolled_weapon_usage_pct: typeof usageRatio === "number" ? Math.round(usageRatio * 100) : null,
      compliance_status: run.compliance_status ?? "unknown",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "weekly_challenge_id,user_id" },
  );
};

/** Evaluate and award badges earned by a finalized run. */
export const awardBadgesHandler: JobHandler = async (job, db) => {
  const { data: run } = await db.from("challenge_runs").select("*").eq("id", job.run_id).maybeSingle();
  if (!run || !run.created_by) return;

  const { data: participant } = await db
    .from("challenge_run_participants")
    .select("bungie_membership_id")
    .eq("run_id", run.id)
    .eq("user_id", run.created_by)
    .maybeSingle();

  let leaderboardEntry: { rank: number | null; totalEntries: number } | null = null;
  if (run.weekly_challenge_id) {
    const [{ data: entry }, { count }] = await Promise.all([
      db.from("weekly_leaderboard_entries").select("rank").eq("weekly_challenge_id", run.weekly_challenge_id).eq("user_id", run.created_by).maybeSingle(),
      db.from("weekly_leaderboard_entries").select("id", { count: "exact", head: true }).eq("weekly_challenge_id", run.weekly_challenge_id),
    ]);
    if (entry) leaderboardEntry = { rank: entry.rank ?? null, totalEntries: count ?? 0 };
  }

  let currentStreak = 0;
  if (run.season_id) {
    const { data: ps } = await db
      .from("player_season_stats")
      .select("current_streak")
      .eq("user_id", run.created_by)
      .eq("season_id", run.season_id)
      .maybeSingle();
    currentStreak = ps?.current_streak ?? 0;
  }

  const results = evaluateBadges({
    run,
    complianceResult: run.compliance_status
      ? { status: run.compliance_status, weaponUsageRatio: run.scoring_breakdown?.rolledWeaponUsageRatio ?? null }
      : null,
    leaderboardEntry,
    currentStreak,
  });
  if (results.length === 0) return;

  const { data: badges } = await db.from("badges").select("id, slug").in("slug", results.map((r) => r.slug));
  const idBySlug = new Map<string, string>((badges ?? []).map((b: { slug: string; id: string }) => [b.slug, b.id]));

  const inserts = results
    .filter((r) => idBySlug.has(r.slug))
    .map((r) =>
      buildPlayerBadgeInsert(run.created_by, participant?.bungie_membership_id ?? null, idBySlug.get(r.slug)!, r.decision, {
        runId: run.id,
        weeklyChallengeId: run.weekly_challenge_id,
        seasonId: run.season_id,
      }),
    );

  if (inserts.length > 0) {
    await db.from("player_badges").upsert(inserts, { onConflict: "user_id,badge_id,scope_key", ignoreDuplicates: true });
  }
};

// Only runs still in an early, pre-completion state can be reaped as abandoned.
// Once a run reaches completed_pending_pgcr the worker owns its fate (score or
// fail), so expiry must not touch it.
const EXPIRABLE_STATES = ["created", "loadout_rolled", "applied", "in_activity"];

/** Reap a stale, never-completed run (scheduled at run creation as a timeout). */
export const expireRunHandler: JobHandler = async (job, db) => {
  const { data: run } = await db.from("challenge_runs").select("id, status").eq("id", job.run_id).maybeSingle();
  if (!run || !EXPIRABLE_STATES.includes(run.status)) return;
  await db.from("challenge_runs").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", run.id);
};

/** Registered handlers. Unregistered job types are a logged no-op in the runner. */
export const JOB_HANDLERS: Partial<Record<ScoreAttackJobType, JobHandler>> = {
  // Bungie-detection half — pass the runner's db through to the detection deps.
  capture_equipment_snapshot: (job, db) => captureEquipmentSnapshotHandler(job, { db }),
  poll_activity_history: (job, db) => pollActivityHistoryHandler(job, { db }),
  fetch_pgcr: (job, db) => fetchPgcrHandler(job, { db }),
  parse_pgcr: (job, db) => parsePgcrHandler(job, { db }),
  compute_score: (job, db) => computeScoreHandler(job, { db }),
  compute_compliance: (job, db) => computeComplianceHandler(job, { db }),
  // Finalize half.
  update_leaderboard: updateLeaderboardHandler,
  award_badges: awardBadgesHandler,
  expire_run: expireRunHandler,
};

export function getHandler(jobType: ScoreAttackJobType): JobHandler | undefined {
  return JOB_HANDLERS[jobType];
}

// Re-export so callers pass the default client without importing supabase.
export const defaultDb = adminSupabase;
