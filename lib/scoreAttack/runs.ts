// Score Attack / Weekly Challenge run lifecycle data-access (#246).
//
// Wraps the existing roll/apply engine in a persisted run record. Client-driven
// state transitions go through the FSM in runLifecycle.ts (which already blocks
// clients from claiming worker-owned result states); the worker advances runs
// through PGCR fetch → parse → score → finalize separately.
//
// Weekly runs are also gated on the challenge window server-side (#251): a run
// cannot be created for an inactive or already-ended weekly challenge.

import { adminSupabase } from "@/lib/supabase/admin";
import { canTransitionScoreAttackRunState, type ScoreAttackRunActor } from "./runLifecycle";
import { enqueueJob } from "./worker/store";
import type { ScoreAttackRunState } from "./types";

// How long a run may sit in an early state before the worker reaps it (#255).
const RUN_ABANDON_TIMEOUT_MS = 3 * 60 * 60 * 1000;

export type RunMode = "score_attack" | "weekly_challenge";

export interface CreateRunInput {
  userId: string;
  bungieMembershipId: string;
  bungieMembershipType: number;
  mode: RunMode;
  weeklyChallengeId?: string | null;
  lobbyId?: string | null;
  roundId?: string | null;
}

export interface RunResult {
  ok: boolean;
  runId?: string;
  status?: ScoreAttackRunState;
  error?: string;
  httpStatus?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = typeof adminSupabase;

/**
 * Create a run record and its owner participant row. For weekly runs, validates
 * that the referenced challenge is active and inside its window (#251).
 */
export async function createRun(input: CreateRunInput, db: Db = adminSupabase): Promise<RunResult> {
  let seasonId: string | null = null;
  let versionId: string | null = null;
  let activityHash: number | null = null;

  if (input.mode === "weekly_challenge") {
    if (!input.weeklyChallengeId) {
      return { ok: false, error: "weeklyChallengeId is required for a weekly run", httpStatus: 400 };
    }
    const { data: challenge } = await db
      .from("weekly_challenges")
      .select("id, status, ends_at, season_id, activity_hash")
      .eq("id", input.weeklyChallengeId)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = challenge as any;
    if (!c) return { ok: false, error: "Weekly challenge not found", httpStatus: 404 };
    if (c.status !== "active") {
      return { ok: false, error: "This weekly challenge is not active.", httpStatus: 409 };
    }
    if (new Date(c.ends_at).getTime() <= Date.now()) {
      return { ok: false, error: "This weekly challenge has ended.", httpStatus: 409 };
    }
    seasonId = c.season_id ?? null;
    activityHash = c.activity_hash ?? null;

    // challenge_runs requires the published version snapshot for weekly runs
    // (migration 026 CHECK) so later edits never change what a run was scored
    // against. Latest version wins — publish always writes one.
    const { data: version } = await db
      .from("weekly_challenge_versions")
      .select("id")
      .eq("weekly_challenge_id", input.weeklyChallengeId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    versionId = (version as any)?.id ?? null;
    if (!versionId) {
      return { ok: false, error: "This weekly challenge has no published version.", httpStatus: 409 };
    }
  } else {
    // Score Attack runs count toward the active season's aggregates too.
    const { data: season } = await db
      .from("seasons")
      .select("id")
      .eq("status", "active")
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    seasonId = (season as any)?.id ?? null;
  }

  const { data: run, error } = await db
    .from("challenge_runs")
    .insert({
      mode: input.mode,
      status: "created",
      weekly_challenge_id: input.mode === "weekly_challenge" ? input.weeklyChallengeId : null,
      weekly_challenge_version_id: versionId,
      season_id: seasonId,
      activity_hash: activityHash,
      lobby_id: input.lobbyId ?? null,
      round_id: input.roundId ?? null,
      created_by: input.userId,
      started_at: new Date().toISOString(),
    })
    .select("id, status")
    .single();

  if (error || !run) {
    return { ok: false, error: error?.message ?? "Failed to create run", httpStatus: 500 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = run as any;
  await db.from("challenge_run_participants").insert({
    run_id: r.id,
    user_id: input.userId,
    bungie_membership_id: input.bungieMembershipId,
    bungie_membership_type: input.bungieMembershipType,
    is_owner: true,
  });

  // Schedule an abandonment reaper so runs that never finish don't poll forever.
  // Best-effort: a queue hiccup must not fail run creation.
  try {
    await enqueueJob(
      {
        jobType: "expire_run",
        runId: r.id,
        payload: { runId: r.id },
        runAt: new Date(Date.now() + RUN_ABANDON_TIMEOUT_MS).toISOString(),
      },
      db,
    );
  } catch {
    /* non-fatal */
  }

  return { ok: true, runId: r.id, status: r.status };
}

/**
 * Apply a client-driven state transition to a run the caller owns. The FSM
 * rejects illegal transitions and any attempt to claim a worker-owned result
 * state (parsed/scored/finalized/…).
 */
export async function transitionRun(
  args: { runId: string; userId: string; next: ScoreAttackRunState; actor?: ScoreAttackRunActor },
  db: Db = adminSupabase,
): Promise<RunResult> {
  const { data: run } = await db
    .from("challenge_runs")
    .select("id, status, created_by, activity_hash")
    .eq("id", args.runId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = run as any;
  if (!r) return { ok: false, error: "Run not found", httpStatus: 404 };
  if (r.created_by !== args.userId) {
    return { ok: false, error: "You do not own this run.", httpStatus: 403 };
  }

  const check = canTransitionScoreAttackRunState({
    current: r.status,
    next: args.next,
    actor: args.actor ?? "client",
  });
  if (!check.ok) {
    return { ok: false, error: `Invalid transition: ${check.reason}`, httpStatus: 400 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { status: args.next, updated_at: new Date().toISOString() };
  if (args.next === "completed_pending_pgcr") patch.completed_at = new Date().toISOString();

  const { error } = await db.from("challenge_runs").update(patch).eq("id", args.runId);
  if (error) return { ok: false, error: error.message, httpStatus: 500 };

  // Once the loadout is applied, start watching the activity: kick off the first
  // equipment snapshot + activity-history poll (both self-reschedule). Best
  // effort — a queue hiccup must not fail the transition.
  if (args.next === "applied") {
    try {
      const { data: owner } = await db
        .from("challenge_run_participants")
        .select("bungie_membership_id, bungie_membership_type, character_id")
        .eq("run_id", args.runId)
        .eq("user_id", args.userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = owner as any;
      if (o?.bungie_membership_id && o?.character_id) {
        const base = {
          runId: args.runId,
          membershipId: o.bungie_membership_id,
          membershipType: o.bungie_membership_type ?? 3,
          characterId: o.character_id,
        };
        await enqueueJob({ jobType: "capture_equipment_snapshot", runId: args.runId, payload: base }, db);
        await enqueueJob({ jobType: "poll_activity_history", runId: args.runId, payload: { ...base, appliedAt: new Date().toISOString() } }, db);
      }
    } catch {
      /* non-fatal */
    }
  }

  // Best-effort audit trail; failure here must not fail the transition.
  try {
    await db.from("challenge_run_events").insert({
      run_id: args.runId,
      event_type: "state_transition",
      payload: { from: r.status, to: args.next, actor: args.actor ?? "client" },
    });
  } catch {
    /* audit is best-effort */
  }

  return { ok: true, runId: args.runId, status: args.next };
}
