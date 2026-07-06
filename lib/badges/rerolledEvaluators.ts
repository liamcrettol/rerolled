import type { ActivityFamily, ChallengeRun, ChallengeRunLoadoutSlot, RunLegalityResult } from "@/types/challenges";
import { NOT_YET_IMPLEMENTED_REROLLED_SLUGS } from "./catalog";

// Generic rule dispatcher for the Rerolled badge set (Core/Crucible/Trials/
// Iron Banner/PvE/Status — supabase/migrations/037_rerolled_badge_seed.sql).
//
// The legacy evaluators.ts pattern (one named const per badge slug) doesn't
// scale to 48 badges when most of them are the same shape repeated per mode
// ("win/complete X with a valid loadout", a threshold at several cutoffs,
// "earned medal Y"). Each badge's `criteria` jsonb carries a `rule` key that
// selects one of ~20 shared rule functions here instead. Called once per
// badge row fetched from the catalog by the worker (worker wiring itself —
// fetching badges, building this context from a run's PGCR/legality/card
// data, persisting player_badges rows — is separate follow-up work, not
// implemented here).
//
// All seeded badges have an evaluator (#278: trials_verdict/trials_last_rite
// were cut outright — verified against Bungie's actual PGCR schema
// (DestinyPostGameCarnageReportData: only entries[] and teams[], both
// whole-match aggregates) that round-by-round final-blow data doesn't exist
// in the API at all, not just "not built yet"). manual_grant is intentionally
// NOT dispatched here at all; Status/Legacy badges are granted through a
// separate admin path, not run evaluation. If a future badge's rule has no
// evaluator, add it to NOT_YET_IMPLEMENTED_RULES below so dispatch throws
// instead of silently misevaluating.
//
// team_final_blow_lead (Proven) does NOT need round data despite the badge's
// "round-based match" phrasing — "leading your team in final blows" is a
// whole-match comparison (entries[].values.kills grouped by
// entries[].values.team), which the schema does support.

export interface RerolledActivityContext {
  family: ActivityFamily | null;
  modeKey: string | null;
  isWin: boolean | null;
  isCompleted: boolean | null;
  defeats: number | null;
  teamPlacement: number | null;
  totalTeams: number | null;
  medalKeys: string[];
  isUndefeated: boolean | null;
  isMercy: boolean | null;
  scoreLeadOnTeam: boolean | null;
  objectiveLeadOnTeam: boolean | null;
  /** This player recorded the most final blows among their own team (entries[].values.team). */
  finalBlowLeadOnTeam: boolean | null;
}

export interface RerolledCardContext {
  cardId: string;
  winsOnCard: number;
  isFlawless: boolean;
  isComplete: boolean;
}

export interface RerolledSnapshotContext {
  totalSnapshots: number;
  offLoadoutSnapshots: number;
}

export interface RerolledBadgeContext {
  run: ChallengeRun;
  legality?: RunLegalityResult | null;
  fireteamLegality?: RunLegalityResult[] | null;
  loadoutSlots?: ChallengeRunLoadoutSlot[];
  snapshots?: RerolledSnapshotContext | null;
  activity?: RerolledActivityContext | null;
  card?: RerolledCardContext | null;
  currentValidStreak?: number;
  leaderboardEligible?: boolean;
  weeklyChallengeVerified?: boolean;
  weeklyMatchCount?: number;
  weeklyValidMatchCount?: number;
  weekScopeKey?: string | null;
}

export interface RerolledAwardDecision {
  awarded: boolean;
  scopeKey: string;
  metadata?: Record<string, unknown>;
}

export type RerolledRuleFn = (criteria: Record<string, unknown>, ctx: RerolledBadgeContext) => RerolledAwardDecision;

const PVE_FAMILIES: ActivityFamily[] = ["gm", "nightfall", "dungeon", "raid", "vanguard"];

function familyGroup(value: unknown): ActivityFamily[] | null {
  if (value === "pve") return PVE_FAMILIES;
  if (Array.isArray(value)) return value as ActivityFamily[];
  if (typeof value === "string") return [value as ActivityFamily];
  return null;
}

function matchesActivityFamily(criteria: Record<string, unknown>, activity: RerolledActivityContext | null | undefined): boolean {
  const required = familyGroup(criteria.activity_family);
  if (!required) return true; // no family constraint on this badge
  if (!activity?.family) return false;
  return required.includes(activity.family);
}

function matchesActivityMode(criteria: Record<string, unknown>, activity: RerolledActivityContext | null | undefined): boolean {
  if (typeof criteria.activity_mode !== "string") return true;
  return activity?.modeKey === criteria.activity_mode;
}

function isValid(ctx: RerolledBadgeContext): boolean {
  return ctx.legality?.is_valid === true;
}

function runScope(ctx: RerolledBadgeContext): string {
  return ctx.run.id;
}

const ruleFns: Record<string, RerolledRuleFn> = {
  first_valid_run: (_criteria, ctx) => ({ awarded: isValid(ctx), scopeKey: "once" }),

  zero_illegal_final_blows: (_criteria, ctx) => ({ awarded: isValid(ctx), scopeKey: runScope(ctx) }),

  zero_illegal_and_loadout_stable: (_criteria, ctx) => ({
    awarded: isValid(ctx) && ctx.snapshots != null && ctx.snapshots.offLoadoutSnapshots === 0,
    scopeKey: runScope(ctx),
  }),

  all_rolled_weapons_used: (criteria, ctx) => {
    const slots = ctx.loadoutSlots ?? [];
    const rolledHashes = slots.map((slot) => slot.item_hash);
    const used = new Set(ctx.legality?.rolled_weapons_used ?? []);
    const awarded =
      isValid(ctx) &&
      matchesActivityFamily(criteria, ctx.activity) &&
      rolledHashes.length > 0 &&
      rolledHashes.every((hash) => used.has(hash));
    return { awarded, scopeKey: runScope(ctx) };
  },

  fireteam_all_valid: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      matchesActivityFamily(criteria, ctx.activity) &&
      (ctx.fireteamLegality ?? []).length > 0 &&
      (ctx.fireteamLegality ?? []).every((entry) => entry.is_valid),
    scopeKey: runScope(ctx),
  }),

  valid_streak: (criteria, ctx) => ({
    awarded: (ctx.currentValidStreak ?? 0) >= Number(criteria.length ?? 0),
    scopeKey: "once",
  }),

  leaderboard_eligible: (_criteria, ctx) => ({ awarded: ctx.leaderboardEligible === true, scopeKey: runScope(ctx) }),

  weekly_challenge_verified: (_criteria, ctx) => ({
    awarded: ctx.weeklyChallengeVerified === true,
    scopeKey: ctx.run.weekly_challenge_id ?? runScope(ctx),
  }),

  invalid_marker: (_criteria, ctx) => ({
    awarded: ctx.legality != null && ctx.legality.is_valid === false,
    scopeKey: runScope(ctx),
  }),

  win_valid_activity: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      ctx.activity?.isWin === true &&
      matchesActivityFamily(criteria, ctx.activity) &&
      matchesActivityMode(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  complete_valid_activity: (criteria, ctx) => ({
    awarded: isValid(ctx) && ctx.activity?.isCompleted === true && matchesActivityFamily(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  defeat_threshold: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      matchesActivityFamily(criteria, ctx.activity) &&
      (ctx.activity?.defeats ?? -1) >= Number(criteria.min_defeats ?? Infinity),
    scopeKey: runScope(ctx),
  }),

  team_score_lead: (criteria, ctx) => ({
    awarded: isValid(ctx) && ctx.activity?.scoreLeadOnTeam === true && matchesActivityFamily(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  objective_lead_win: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      ctx.activity?.isWin === true &&
      ctx.activity?.objectiveLeadOnTeam === true &&
      matchesActivityMode(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  mercy_win: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      ctx.activity?.isWin === true &&
      ctx.activity?.isMercy === true &&
      matchesActivityMode(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  placement_top_n: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      ctx.activity?.teamPlacement != null &&
      ctx.activity.teamPlacement <= Number(criteria.max_placement ?? 0) &&
      matchesActivityFamily(criteria, ctx.activity) &&
      matchesActivityMode(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  medal_earned: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      typeof criteria.medal_key === "string" &&
      (ctx.activity?.medalKeys ?? []).includes(criteria.medal_key) &&
      matchesActivityFamily(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  undefeated_win: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      ctx.activity?.isWin === true &&
      ctx.activity?.isUndefeated === true &&
      matchesActivityFamily(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  card_win_count: (criteria, ctx) => ({
    awarded: isValid(ctx) && (ctx.card?.winsOnCard ?? 0) >= Number(criteria.min_wins_on_card ?? Infinity),
    scopeKey: ctx.card?.cardId ?? runScope(ctx),
  }),

  flawless_card: (criteria, ctx) => ({
    awarded: isValid(ctx) && ctx.card?.isFlawless === true && matchesActivityFamily(criteria, ctx.activity),
    scopeKey: ctx.card?.cardId ?? runScope(ctx),
  }),

  card_complete_valid: (criteria, ctx) => ({
    awarded: isValid(ctx) && ctx.card?.isComplete === true && matchesActivityFamily(criteria, ctx.activity),
    scopeKey: ctx.card?.cardId ?? runScope(ctx),
  }),

  weekly_match_count: (criteria, ctx) => ({
    awarded:
      matchesActivityFamily(criteria, ctx.activity) &&
      (ctx.weeklyMatchCount ?? 0) >= Number(criteria.min_matches ?? Infinity),
    scopeKey: ctx.weekScopeKey ?? runScope(ctx),
  }),

  team_final_blow_lead: (criteria, ctx) => ({
    awarded:
      isValid(ctx) &&
      ctx.activity?.isWin === true &&
      ctx.activity?.finalBlowLeadOnTeam === true &&
      matchesActivityFamily(criteria, ctx.activity),
    scopeKey: runScope(ctx),
  }),

  // Rite of Iron (#278): "session" was redefined to the whole active Iron
  // Banner week (same scope as weekly_match_count) rather than an undefined
  // play-sitting concept — zero invalid matches across every match played
  // that week, not just a minimum count.
  weekly_all_valid: (criteria, ctx) => ({
    awarded:
      matchesActivityFamily(criteria, ctx.activity) &&
      (ctx.weeklyMatchCount ?? 0) > 0 &&
      ctx.weeklyValidMatchCount === ctx.weeklyMatchCount,
    scopeKey: ctx.weekScopeKey ?? runScope(ctx),
  }),
};

const NOT_YET_IMPLEMENTED_RULES = new Set<string>([]);

export function evaluateRerolledBadge(criteria: Record<string, unknown>, ctx: RerolledBadgeContext): RerolledAwardDecision {
  const rule = criteria.rule;
  if (typeof rule !== "string") {
    throw new Error(`badge criteria missing a "rule" key: ${JSON.stringify(criteria)}`);
  }
  if (rule === "manual_grant") {
    throw new Error("manual_grant badges are not run-evaluated — grant them through the admin path instead");
  }
  if (NOT_YET_IMPLEMENTED_RULES.has(rule)) {
    throw new Error(
      `rule "${rule}" has no evaluator yet (needs round-by-round PGCR data or a defined session boundary) — see NOT_YET_IMPLEMENTED_REROLLED_SLUGS in lib/badges/catalog.ts`
    );
  }
  const fn = ruleFns[rule];
  if (!fn) {
    throw new Error(`unknown badge rule "${rule}"`);
  }
  return fn(criteria, ctx);
}

export { NOT_YET_IMPLEMENTED_REROLLED_SLUGS };


