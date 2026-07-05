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
import type { ScoreAttackRunState } from "./types";

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

  if (input.mode === "weekly_challenge") {
    if (!input.weeklyChallengeId) {
      return { ok: false, error: "weeklyChallengeId is required for a weekly run", httpStatus: 400 };
    }
    const { data: challenge } = await db
      .from("weekly_challenges")
      .select("id, status, ends_at, season_id")
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
  }

  const { data: run, error } = await db
    .from("challenge_runs")
    .insert({
      mode: input.mode,
      status: "created",
      weekly_challenge_id: input.mode === "weekly_challenge" ? input.weeklyChallengeId : null,
      season_id: seasonId,
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
    .select("id, status, created_by")
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
