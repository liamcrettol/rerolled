// Worker job handlers (#255, finalize path).
//
// Implemented here: the "results" half of the pipeline — turning a scored run
// into leaderboard standings, badges, and terminal state. These are pure DB
// transforms over an injectable client, so they're unit-testable and their
// writes were validated against the live schema.

import { adminSupabase } from "@/lib/supabase/admin";
import { buildPlayerBadgeInsert, evaluateBadges } from "@/lib/badges/evaluators";
import { evaluateRerolledBadge, type RerolledBadgeContext } from "@/lib/badges/rerolledEvaluators";
import { computeSnapshotCompliance } from "@/lib/scoreAttack/compliance";
import { getActivityByHash, getActivityKindByHash, type ActivityKind } from "@/lib/scoreAttack/activityPool";
import { selectTrialsPassageCard, type TrialsPassageSnapshot } from "@/lib/scoreAttack/trialsPassages";
import type { NormalizedPvpPgcrPlayer } from "@/lib/scoreAttack/types";
import type {
  ActivityFamily,
  ChallengeRun,
  ChallengeRunLoadoutSlot,
  RunLegalityResult,
  RunTrialsPassageSnapshot,
} from "@/types/challenges";
import {
  captureEquipmentSnapshotHandler,
  captureTrialsPassageSnapshotHandler,
  pollActivityHistoryHandler,
  fetchPgcrHandler,
  parsePgcrHandler,
  computeScoreHandler,
  computeComplianceHandler,
  computeLegalityHandler,
} from "./detection";
import type { WorkerJobRow } from "./store";
import type { ScoreAttackJobType } from "./jobs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
export type JobHandler = (job: WorkerJobRow, db: Db) => Promise<void>;

interface BadgeRow {
  id: string;
  slug: string;
  criteria: Record<string, unknown>;
  mode: string | null;
}

const OBJECTIVE_SCORE_KEYS = [
  "objective",
  "objectives",
  "objective_score",
  "captures",
  "capture_points",
  "zones_captured",
  "zone_captures",
  "crests_recovered",
];

function kindToActivityFamily(kind: ActivityKind | null): ActivityFamily | null {
  switch (kind) {
    case "grandmaster":
      return "gm";
    case "raid":
      return "raid";
    case "dungeon":
      return "dungeon";
    case "vanguard-op":
    case "onslaught":
      return "vanguard";
    case "crucible":
      return "crucible";
    case "trials":
      return "trials";
    case "iron-banner":
      return "iron_banner";
    default:
      return null;
  }
}

function modeKeyForActivityName(name: string | null | undefined): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes("rumble")) return "rumble";
  if (lower.includes("control")) return "control";
  return null;
}

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function leadFlag(
  players: NormalizedPvpPgcrPlayer[],
  player: NormalizedPvpPgcrPlayer | null,
  selector: (entry: NormalizedPvpPgcrPlayer) => number | null,
): boolean | null {
  if (!player) return null;
  const current = selector(player);
  if (current === null) return null;

  const peers = player.team !== null
    ? players.filter((entry) => entry.team === player.team)
    : [player];
  const comparable = peers
    .map((entry) => selector(entry))
    .filter((value): value is number => value !== null);
  if (!comparable.length) return null;
  return Math.max(...comparable) === current;
}

function objectiveValue(player: NormalizedPvpPgcrPlayer): number | null {
  for (const key of OBJECTIVE_SCORE_KEYS) {
    const value = valueOrNull(player.scoreboardValues[key]);
    if (value !== null) return value;
  }
  return null;
}

function teamPlacement(players: NormalizedPvpPgcrPlayer[], player: NormalizedPvpPgcrPlayer | null): number | null {
  if (!player) return null;
  if (player.team === null) return player.standing;

  const teammates = players.filter((entry) => entry.team === player.team);
  if (!teammates.length) return null;

  const ranked = [...teammates].sort((a, b) => {
    const scoreDelta = (b.score ?? -Infinity) - (a.score ?? -Infinity);
    if (scoreDelta !== 0) return scoreDelta;
    return (b.kills ?? -Infinity) - (a.kills ?? -Infinity);
  });
  const index = ranked.findIndex((entry) => entry.membershipId === player.membershipId);
  return index >= 0 ? index + 1 : null;
}

function weekWindow(date: Date): { weekScopeKey: string; startsAt: Date; endsAt: Date } {
  const reset = new Date(date);
  reset.setUTCHours(17, 0, 0, 0);

  const day = reset.getUTCDay();
  const daysSinceTuesday = (day + 5) % 7;
  reset.setUTCDate(reset.getUTCDate() - daysSinceTuesday);
  if (date.getTime() < reset.getTime()) reset.setUTCDate(reset.getUTCDate() - 7);

  const endsAt = new Date(reset.getTime());
  endsAt.setUTCDate(endsAt.getUTCDate() + 7);
  return {
    weekScopeKey: reset.toISOString().slice(0, 10),
    startsAt: reset,
    endsAt,
  };
}

function runTimestamp(run: Pick<ChallengeRun, "completed_at" | "finalized_at" | "created_at">): string {
  return run.completed_at ?? run.finalized_at ?? run.created_at;
}

async function loadAllBadges(db: Db): Promise<BadgeRow[]> {
  const { data } = await db.from("badges").select("id, slug, criteria, mode");
  return (data ?? []).map((badge: BadgeRow) => ({
    id: badge.id,
    slug: badge.slug,
    criteria: badge.criteria ?? {},
    mode: badge.mode ?? null,
  }));
}

async function loadRun(db: Db, runId: string) {
  const { data } = await db.from("challenge_runs").select("*").eq("id", runId).maybeSingle();
  return data as ChallengeRun | null;
}

async function loadParticipantMembership(db: Db, runId: string, userId: string) {
  const { data } = await db
    .from("challenge_run_participants")
    .select("bungie_membership_id")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.bungie_membership_id ?? null;
}

async function loadLoadoutSlots(db: Db, runId: string): Promise<ChallengeRunLoadoutSlot[]> {
  const { data } = await db.from("challenge_run_loadout_slots").select("*").eq("run_id", runId);
  return data ?? [];
}

async function loadLegality(db: Db, runId: string, userId: string): Promise<RunLegalityResult | null> {
  const { data } = await db
    .from("run_legality_results")
    .select("*")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function loadFireteamLegality(db: Db, runId: string, userId: string): Promise<RunLegalityResult[]> {
  const { data } = await db.from("run_legality_results").select("*").eq("run_id", runId);
  return (data ?? []).filter((row: RunLegalityResult) => row.user_id !== userId);
}

async function loadNormalizedPgcr(db: Db, instanceId: string | null) {
  if (!instanceId) return null;
  const { data } = await db.from("pgcr_cache").select("normalized_pgcr").eq("instance_id", instanceId).maybeSingle();
  return data?.normalized_pgcr ?? null;
}

async function loadSnapshots(db: Db, runId: string, membershipId: string | null) {
  if (!membershipId) return [];
  const { data } = await db
    .from("run_equipment_snapshots")
    .select("captured_at, bungie_membership_id, character_id, equipped")
    .eq("run_id", runId)
    .eq("bungie_membership_id", membershipId);
  return (data ?? []).map((snapshot: { captured_at: string; bungie_membership_id: string; character_id: string | null; equipped: unknown }) => ({
    capturedAt: snapshot.captured_at,
    membershipId: snapshot.bungie_membership_id,
    characterId: snapshot.character_id ?? undefined,
    weapons: Array.isArray(snapshot.equipped) ? snapshot.equipped : [],
  }));
}

async function loadTrialsPassageSnapshots(db: Db, runId: string, userId: string): Promise<RunTrialsPassageSnapshot[]> {
  const { data } = await db
    .from("run_trials_passage_snapshots")
    .select("*")
    .eq("run_id", runId)
    .eq("user_id", userId);
  return data ?? [];
}

function toTrialsPassageSnapshot(row: RunTrialsPassageSnapshot): TrialsPassageSnapshot {
  return {
    passageInstanceId: row.passage_instance_id,
    passageItemHash: row.passage_item_hash,
    passageName: row.passage_name,
    bucketHash: row.bucket_hash ?? 0,
    source: "profile",
    characterId: row.character_id,
    wins: row.wins,
    roundsWon: row.rounds_won,
    activeWinStreak: row.active_win_streak,
    flawlessWinStreak: row.flawless_win_streak,
    flawlessProgress: row.flawless_progress,
    isFlawless: row.is_flawless,
    isComplete: row.is_complete,
    trialsMultiplier: row.trials_multiplier,
    objectiveProgress: row.raw_objectives ?? {},
  };
}

async function loadLeaderboardEntry(db: Db, run: ChallengeRun) {
  if (!run.weekly_challenge_id || !run.created_by) return null;
  const [{ data: entry }, { count }] = await Promise.all([
    db.from("weekly_leaderboard_entries").select("rank").eq("weekly_challenge_id", run.weekly_challenge_id).eq("user_id", run.created_by).maybeSingle(),
    db.from("weekly_leaderboard_entries").select("id", { count: "exact", head: true }).eq("weekly_challenge_id", run.weekly_challenge_id),
  ]);
  if (!entry) return null;
  return { rank: entry.rank ?? null, totalEntries: count ?? 0 };
}

async function loadSeasonStreak(db: Db, run: ChallengeRun) {
  if (!run.season_id || !run.created_by) return 0;
  const { data } = await db
    .from("player_season_stats")
    .select("current_streak")
    .eq("user_id", run.created_by)
    .eq("season_id", run.season_id)
    .maybeSingle();
  return data?.current_streak ?? 0;
}

async function loadUserRuns(db: Db, userId: string) {
  const { data } = await db.from("challenge_runs").select("id, activity_hash, completed_at, finalized_at, created_at").eq("created_by", userId);
  return data ?? [];
}

async function loadUserLegalityRows(db: Db, userId: string) {
  const { data } = await db.from("run_legality_results").select("run_id, is_valid").eq("user_id", userId);
  return data ?? [];
}

async function computeCurrentValidStreak(db: Db, run: ChallengeRun): Promise<number> {
  if (!run.created_by) return 0;
  const [runs, legalityRows] = await Promise.all([
    loadUserRuns(db, run.created_by),
    loadUserLegalityRows(db, run.created_by),
  ]);
  const targetTime = new Date(runTimestamp(run)).getTime();
  const legalityByRun = new Map<string, boolean>((legalityRows ?? []).map((row: { run_id: string; is_valid: boolean }) => [row.run_id, row.is_valid]));

  const ordered = (runs ?? [])
    .map((entry: { id: string; completed_at: string | null; finalized_at: string | null; created_at: string }) => ({
      id: entry.id,
      time: new Date(entry.completed_at ?? entry.finalized_at ?? entry.created_at).getTime(),
    }))
    .filter((entry: { id: string; time: number }) => Number.isFinite(entry.time) && entry.time <= targetTime && legalityByRun.has(entry.id))
    .sort((a: { time: number }, b: { time: number }) => b.time - a.time);

  let streak = 0;
  for (const entry of ordered) {
    if (!legalityByRun.get(entry.id)) break;
    streak += 1;
  }
  return streak;
}

async function computeWeeklyLegalityStats(
  db: Db,
  run: ChallengeRun,
  family: ActivityFamily | null,
): Promise<{ weekScopeKey: string | null; weeklyMatchCount: number; weeklyValidMatchCount: number }> {
  if (!run.created_by || family !== "iron_banner") {
    return { weekScopeKey: null, weeklyMatchCount: 0, weeklyValidMatchCount: 0 };
  }

  const anchor = new Date(runTimestamp(run));
  if (!Number.isFinite(anchor.getTime())) {
    return { weekScopeKey: null, weeklyMatchCount: 0, weeklyValidMatchCount: 0 };
  }

  const { weekScopeKey, startsAt, endsAt } = weekWindow(anchor);
  const [runs, legalityRows] = await Promise.all([
    loadUserRuns(db, run.created_by),
    loadUserLegalityRows(db, run.created_by),
  ]);
  const legalityByRun = new Map<string, boolean>((legalityRows ?? []).map((row: { run_id: string; is_valid: boolean }) => [row.run_id, row.is_valid]));

  const inScope = (runs ?? []).filter((entry: { id: string; activity_hash: number | null; completed_at: string | null; finalized_at: string | null; created_at: string }) => {
    const time = new Date(entry.completed_at ?? entry.finalized_at ?? entry.created_at).getTime();
    if (!Number.isFinite(time) || time < startsAt.getTime() || time >= endsAt.getTime()) return false;
    return kindToActivityFamily(entry.activity_hash != null ? getActivityKindByHash(entry.activity_hash) : null) === family;
  });

  return {
    weekScopeKey,
    weeklyMatchCount: inScope.length,
    weeklyValidMatchCount: inScope.filter((entry: { id: string }) => legalityByRun.get(entry.id) === true).length,
  };
}

async function buildRerolledContext(db: Db, run: ChallengeRun, membershipId: string | null): Promise<RerolledBadgeContext> {
  const [legality, fireteamLegality, loadoutSlots, pgcr, snapshots, currentValidStreak, trialsPassageRows] = await Promise.all([
    run.created_by ? loadLegality(db, run.id, run.created_by) : Promise.resolve(null),
    run.created_by ? loadFireteamLegality(db, run.id, run.created_by) : Promise.resolve([]),
    loadLoadoutSlots(db, run.id),
    loadNormalizedPgcr(db, run.pgcr_instance_id),
    loadSnapshots(db, run.id, membershipId),
    computeCurrentValidStreak(db, run),
    run.created_by ? loadTrialsPassageSnapshots(db, run.id, run.created_by) : Promise.resolve([]),
  ]);

  const expectedWeapons = loadoutSlots.map((slot) => ({
    slot: slot.slot,
    weaponHash: slot.item_hash,
    weaponType: slot.weapon_type ?? undefined,
    optional: slot.is_wildcard,
  }));
  const snapshotResult = computeSnapshotCompliance({ snapshots, expectedWeapons });

  const activityHash = run.activity_hash ?? (pgcr?.activityHash ?? null);
  const kind = activityHash != null ? getActivityKindByHash(activityHash) : null;
  const family = kindToActivityFamily(kind);
  const activityEntry = activityHash != null ? getActivityByHash(activityHash) : null;
  const modeKey = modeKeyForActivityName(activityEntry?.name);

  const pvpPlayer = pgcr?.kind === "pvp" && membershipId
    ? pgcr.players.find((player: NormalizedPvpPgcrPlayer) => player.membershipId === membershipId) ?? null
    : null;

  const activity = {
    family,
    modeKey,
    isWin: pvpPlayer?.isWin ?? null,
    isCompleted: pgcr?.kind === "pve" ? pgcr.completed : null,
    defeats: pvpPlayer?.kills ?? null,
    teamPlacement: pgcr?.kind === "pvp" ? teamPlacement(pgcr.players, pvpPlayer) : null,
    totalTeams: pgcr?.kind === "pvp"
      ? (pgcr.teams.length || new Set(pgcr.players.map((player: NormalizedPvpPgcrPlayer) => player.team).filter((value: number | null) => value !== null)).size || null)
      : null,
    medalKeys: pvpPlayer?.medalKeys ?? [],
    isUndefeated: pvpPlayer?.deaths != null ? pvpPlayer.deaths === 0 : null,
    isMercy: null,
    scoreLeadOnTeam: pgcr?.kind === "pvp" ? leadFlag(pgcr.players, pvpPlayer, (player) => player.score) : null,
    objectiveLeadOnTeam: pgcr?.kind === "pvp" ? leadFlag(pgcr.players, pvpPlayer, objectiveValue) : null,
    finalBlowLeadOnTeam: pgcr?.kind === "pvp" ? leadFlag(pgcr.players, pvpPlayer, (player) => player.kills) : null,
  };

  const weeklyStats = await computeWeeklyLegalityStats(db, run, family);
  const preMatchPassages = trialsPassageRows
    .filter((row: RunTrialsPassageSnapshot) => row.capture_phase === "pre_match")
    .map(toTrialsPassageSnapshot);
  const postMatchPassages = trialsPassageRows
    .filter((row: RunTrialsPassageSnapshot) => row.capture_phase === "post_match")
    .map(toTrialsPassageSnapshot);
  const card = family === "trials"
    ? selectTrialsPassageCard({
      preMatchSnapshots: preMatchPassages,
      postMatchSnapshots: postMatchPassages,
      isWin: activity.isWin,
    })
    : null;

  return {
    run,
    legality,
    fireteamLegality,
    loadoutSlots,
    snapshots: {
      totalSnapshots: snapshotResult.totalSnapshots,
      offLoadoutSnapshots: snapshotResult.offLoadoutSnapshots,
    },
    activity,
    card,
    currentValidStreak,
    leaderboardEligible: run.compliance_status === "eligible",
    weeklyChallengeVerified: run.mode === "weekly_challenge" && run.compliance_status === "eligible",
    weeklyMatchCount: weeklyStats.weeklyMatchCount,
    weeklyValidMatchCount: weeklyStats.weeklyValidMatchCount,
    weekScopeKey: weeklyStats.weekScopeKey,
  };
}

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

export const awardBadgesHandler: JobHandler = async (job, db) => {
  if (!job.run_id) return;
  const run = await loadRun(db, job.run_id);
  if (!run || !run.created_by) return;
  const userId = run.created_by;
  const [membershipId, leaderboardEntry, currentStreak, loadoutSlots, badgeRows] = await Promise.all([
    loadParticipantMembership(db, run.id, userId),
    loadLeaderboardEntry(db, run),
    loadSeasonStreak(db, run),
    loadLoadoutSlots(db, run.id),
    loadAllBadges(db),
  ]);

  const legacyResults = evaluateBadges({
    run,
    loadoutSlots,
    complianceResult: run.compliance_status
      ? { status: run.compliance_status, weaponUsageRatio: typeof run.scoring_breakdown?.rolledWeaponUsageRatio === "number" ? run.scoring_breakdown.rolledWeaponUsageRatio : null }
      : null,
    leaderboardEntry,
    currentStreak,
  });

  const rerolledContext = await buildRerolledContext(db, run, membershipId);
  const rerolledRows = badgeRows.filter((badge) => badge.mode !== null);
  const rerolledResults = rerolledRows.flatMap((badge) => {
    if (badge.criteria?.rule === "manual_grant") return [];
    try {
      const decision = evaluateRerolledBadge(badge.criteria, rerolledContext);
      return decision.awarded ? [{ badgeId: badge.id, decision }] : [];
    } catch (error) {
      console.warn(
        `[worker] rerolled badge evaluation failed for ${badge.slug} on run ${run.id}:`,
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  });

  if (legacyResults.length === 0 && rerolledResults.length === 0) return;

  const legacyBadgeIds = new Map(
    badgeRows
      .filter((badge) => legacyResults.some((result) => result.slug === badge.slug))
      .map((badge) => [badge.slug, badge.id]),
  );

  const legacyInserts = legacyResults
    .filter((result) => legacyBadgeIds.has(result.slug))
    .map((result) =>
      buildPlayerBadgeInsert(userId, membershipId, legacyBadgeIds.get(result.slug)!, result.decision, {
        runId: run.id,
        weeklyChallengeId: run.weekly_challenge_id,
        seasonId: run.season_id,
      }),
    );

  const rerolledInserts = rerolledResults.map((result) =>
    buildPlayerBadgeInsert(userId, membershipId, result.badgeId, result.decision, {
      runId: run.id,
      weeklyChallengeId: run.weekly_challenge_id,
      seasonId: run.season_id,
    }),
  );

  const inserts = [...legacyInserts, ...rerolledInserts];
  if (inserts.length > 0) {
    await db.from("player_badges").upsert(inserts, { onConflict: "user_id,badge_id,scope_key", ignoreDuplicates: true });
  }
};

const EXPIRABLE_STATES = ["created", "loadout_rolled", "applied", "in_activity"];

export const expireRunHandler: JobHandler = async (job, db) => {
  const { data: run } = await db.from("challenge_runs").select("id, status").eq("id", job.run_id).maybeSingle();
  if (!run || !EXPIRABLE_STATES.includes(run.status)) return;
  await db.from("challenge_runs").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", run.id);
};

export const JOB_HANDLERS: Partial<Record<ScoreAttackJobType, JobHandler>> = {
  capture_equipment_snapshot: (job, db) => captureEquipmentSnapshotHandler(job, { db }),
  capture_trials_passage_snapshot: (job, db) => captureTrialsPassageSnapshotHandler(job, { db }),
  poll_activity_history: (job, db) => pollActivityHistoryHandler(job, { db }),
  fetch_pgcr: (job, db) => fetchPgcrHandler(job, { db }),
  parse_pgcr: (job, db) => parsePgcrHandler(job, { db }),
  compute_score: (job, db) => computeScoreHandler(job, { db }),
  compute_compliance: (job, db) => computeComplianceHandler(job, { db }),
  compute_legality: (job, db) => computeLegalityHandler(job, { db }),
  update_leaderboard: updateLeaderboardHandler,
  award_badges: awardBadgesHandler,
  expire_run: expireRunHandler,
};

export function getHandler(jobType: ScoreAttackJobType): JobHandler | undefined {
  return JOB_HANDLERS[jobType];
}

export const defaultDb = adminSupabase;



