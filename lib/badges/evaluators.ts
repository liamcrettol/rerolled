import type { ChallengeRun, ChallengeRunLoadoutSlot, ComplianceStatus } from "@/types/challenges";
import { BADGE_SLUGS, type BadgeSlug } from "./catalog";

// Badge evaluator registry scaffolding (#257). Deliberately shallow: every
// evaluator reads only fields already persisted by the scoring/compliance
// pipeline (run status, compliance result, leaderboard placement, streak
// count) — none of them recompute score or compliance themselves.

export interface BadgeEvaluationContext {
  run: ChallengeRun;
  loadoutSlots?: ChallengeRunLoadoutSlot[];
  complianceResult?: { status: ComplianceStatus; weaponUsageRatio: number | null } | null;
  /** This player's placement on the run's weekly leaderboard, if applicable. */
  leaderboardEntry?: { rank: number | null; totalEntries: number } | null;
  /** Current weekly-clear streak going into this run, from player_season_stats. */
  currentStreak?: number;
}

export interface BadgeAwardDecision {
  awarded: boolean;
  /** Matches player_badges.scope_key: 'once' for non-repeatable badges, or a scope id for repeatable ones. */
  scopeKey: string;
  metadata?: Record<string, unknown>;
}

export type BadgeEvaluator = (ctx: BadgeEvaluationContext) => BadgeAwardDecision;

function weeklyRunScope(ctx: BadgeEvaluationContext): string {
  return ctx.run.weekly_challenge_id ?? ctx.run.id;
}

const evaluateWeeklyClear: BadgeEvaluator = (ctx) => ({
  awarded: ctx.run.mode === "weekly_challenge" && ctx.run.status === "finalized",
  scopeKey: "once",
});

const evaluatePureRoll: BadgeEvaluator = (ctx) => ({
  awarded:
    ctx.run.status === "finalized" &&
    ctx.complianceResult?.status === "eligible" &&
    ctx.complianceResult?.weaponUsageRatio === 1,
  scopeKey: weeklyRunScope(ctx),
});

const evaluateNoRerolls: BadgeEvaluator = (ctx) => ({
  awarded:
    ctx.run.mode === "weekly_challenge" &&
    ctx.run.status === "finalized" &&
    (ctx.loadoutSlots ?? []).length > 0 &&
    (ctx.loadoutSlots ?? []).every((slot) => slot.reroll_count === 0),
  scopeKey: weeklyRunScope(ctx),
});

const evaluateTop10PercentWeekly: BadgeEvaluator = (ctx) => {
  const entry = ctx.leaderboardEntry;
  const awarded = Boolean(
    entry &&
      entry.rank != null &&
      entry.totalEntries > 0 &&
      entry.rank <= Math.max(1, Math.ceil(entry.totalEntries * 0.1))
  );
  return { awarded, scopeKey: weeklyRunScope(ctx) };
};

const evaluateThreeWeekStreak: BadgeEvaluator = (ctx) => ({
  awarded: (ctx.currentStreak ?? 0) >= 3,
  scopeKey: "once",
});

export const badgeEvaluators: Record<BadgeSlug, BadgeEvaluator> = {
  [BADGE_SLUGS.WEEKLY_CLEAR]: evaluateWeeklyClear,
  [BADGE_SLUGS.PURE_ROLL]: evaluatePureRoll,
  [BADGE_SLUGS.NO_REROLLS]: evaluateNoRerolls,
  [BADGE_SLUGS.TOP_10_PERCENT_WEEKLY]: evaluateTop10PercentWeekly,
  [BADGE_SLUGS.THREE_WEEK_STREAK]: evaluateThreeWeekStreak,
};

export interface BadgeAwardResult {
  slug: BadgeSlug;
  decision: BadgeAwardDecision;
}

export function evaluateBadges(ctx: BadgeEvaluationContext): BadgeAwardResult[] {
  return (Object.keys(badgeEvaluators) as BadgeSlug[])
    .map((slug) => ({ slug, decision: badgeEvaluators[slug](ctx) }))
    .filter((result) => result.decision.awarded);
}

export interface PlayerBadgeInsert {
  user_id: string;
  bungie_membership_id: string | null;
  badge_id: string;
  source_run_id: string | null;
  source_weekly_challenge_id: string | null;
  season_id: string | null;
  scope_key: string;
  metadata: Record<string, unknown>;
}

/**
 * Builds the row to upsert into player_badges for a single award decision.
 * Callers should upsert with `onConflict: "user_id,badge_id,scope_key"` and
 * `ignoreDuplicates: true` — the unique constraint on
 * (user_id, badge_id, scope_key) makes repeated calls for the same run a
 * no-op, so award pipelines can safely re-run without double-awarding.
 */
export function buildPlayerBadgeInsert(
  userId: string,
  bungieMembershipId: string | null,
  badgeId: string,
  decision: BadgeAwardDecision,
  source: { runId: string; weeklyChallengeId: string | null; seasonId: string | null }
): PlayerBadgeInsert {
  return {
    user_id: userId,
    bungie_membership_id: bungieMembershipId,
    badge_id: badgeId,
    source_run_id: source.runId,
    source_weekly_challenge_id: source.weeklyChallengeId,
    season_id: source.seasonId,
    scope_key: decision.scopeKey,
    metadata: decision.metadata ?? {},
  };
}
