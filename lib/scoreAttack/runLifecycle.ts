import type { ScoreAttackRunState } from "./types";

export type ScoreAttackRunActor = "client" | "server" | "worker" | "system";

export interface RunStateTransitionInput {
  current: ScoreAttackRunState;
  next: ScoreAttackRunState;
  actor: ScoreAttackRunActor;
}

export interface RunStateTransitionResult {
  ok: boolean;
  next: ScoreAttackRunState;
  reason?: string;
}

export const SCORE_ATTACK_RUN_STATES: ScoreAttackRunState[] = [
  "created",
  "loadout_rolled",
  "applied",
  "in_activity",
  "completed_pending_pgcr",
  "pgcr_fetched",
  "parsed",
  "scored",
  "finalized",
  "failed",
  "abandoned",
  "expired",
];

const TERMINAL_STATES = new Set<ScoreAttackRunState>([
  "finalized",
  "failed",
  "abandoned",
  "expired",
]);

const TRUSTED_RESULT_STATES = new Set<ScoreAttackRunState>([
  "completed_pending_pgcr",
  "pgcr_fetched",
  "parsed",
  "scored",
  "finalized",
  "failed",
  "expired",
]);

const TRANSITIONS: Record<ScoreAttackRunState, ScoreAttackRunState[]> = {
  created: ["loadout_rolled", "abandoned", "expired"],
  loadout_rolled: ["applied", "abandoned", "expired"],
  applied: ["in_activity", "completed_pending_pgcr", "abandoned", "expired"],
  in_activity: ["completed_pending_pgcr", "abandoned", "expired"],
  completed_pending_pgcr: ["pgcr_fetched", "failed", "expired"],
  pgcr_fetched: ["parsed", "failed", "expired"],
  parsed: ["scored", "failed", "expired"],
  scored: ["finalized", "failed", "expired"],
  finalized: [],
  failed: [],
  abandoned: [],
  expired: [],
};

export function canTransitionScoreAttackRunState(input: RunStateTransitionInput): RunStateTransitionResult {
  if (!SCORE_ATTACK_RUN_STATES.includes(input.current)) {
    return { ok: false, next: input.current, reason: "unknown_current_state" };
  }

  if (!SCORE_ATTACK_RUN_STATES.includes(input.next)) {
    return { ok: false, next: input.current, reason: "unknown_next_state" };
  }

  if (TERMINAL_STATES.has(input.current)) {
    return { ok: false, next: input.current, reason: "terminal_state" };
  }

  if (input.actor === "client" && TRUSTED_RESULT_STATES.has(input.next)) {
    return { ok: false, next: input.current, reason: "trusted_worker_state_required" };
  }

  if (!TRANSITIONS[input.current].includes(input.next)) {
    return { ok: false, next: input.current, reason: "invalid_transition" };
  }

  return { ok: true, next: input.next };
}
