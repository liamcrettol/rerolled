// Automatic run finalization + participant-wide badge awarding.
//
// The existing detection handlers intentionally remain focused on fetching and
// persisting Bungie data. This layer adds the orchestration guarantees needed by
// badge awarding:
//   1. equipment / Trials snapshots fan out to authenticated participants,
//   2. leaderboard and badge jobs refuse to run until score, compliance, and
//      every participant legality row exist,
//   3. the run is finalized exactly once before any award evaluation,
//   4. every participant is evaluated against their own PGCR + legality data.

import { getBungieToken } from "@/lib/auth/helpers";
import { buildPlayerBadgeInsert, evaluateBadges } from "@/lib/badges/evaluators";
import { evaluateRerolledBadge, type RerolledBadgeContext } from "@/lib/badges/rerolledEvaluators";
import { BungieWorkerClient } from "@/lib/bungie/workerClient";
import { computeSnapshotCompliance } from "@/lib/scoreAttack/compliance";
import { getActivityByHash, getActivityKindByHash, type ActivityKind } from "@/lib/scoreAttack/activityPool";
import {
  extractTrialsPassageSnapshots,
  selectTrialsPassageCard,
  type TrialsPassageCapturePhase,
  type TrialsPassageSnapshot,
} from "@/lib/scoreAttack/trialsPassages";
import type { NormalizedPgcr, NormalizedPvpPgcr, NormalizedPvpPgcrPlayer } from "@/lib/scoreAttack/types";
import { bucketToSlot, type BungieProfileResponse, type WeaponSlot } from "@/types/bungie";
import type {
  ActivityFamily,
  ChallengeRun,
  ChallengeRunLoadoutSlot,
  RunLegalityResult,
  RunTrialsPassageSnapshot,
} from "@/types/challenges";
import { parsePgcrHandler } from "./detection";
import {
  getHandler as getBaseHandler,
  updateLeaderboardHandler,
  type JobHandler,
} from "./handlers";
import type { ScoreAttackJobType } from "./jobs";
import { enqueueJob, type WorkerJobRow } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface ParticipantRow {
  user_id: string;
  bungie_membership_id: string;
  bungie_membership_type: number | null;
  character_id: string | null;
  is_owner: boolean;
}

interface BadgeRow {
  id: string;
  slug: string;
  criteria: Record<string, unknown>;
  mode: string | null;
}

const TERMINAL_WITHOUT_AWARDS = new Set(["failed", "abandoned", "expired"]);
const MAX_DETECTION_WINDOW_MS = 2 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 120_000;
const TRIALS_PASSAGE_PROFILE_COMPONENTS = [200, 201, 205, 102, 300, 301].join(",");

// A Control match is treated as a Lockout when the winning team leads by at
// least 50 points or by at least 50%. This is intentionally a deterministic
// score-margin signal because Bungie's normalized PGCR does not expose a
// dedicated mercy-rule boolean.
const LARGE_SCORE_MARGIN = 50;
const LARGE_SCORE_RATIO = 1.5;

function withinWindow(startedAt: string | null): boolean {
  if (!startedAt) return true;
  return Date.now() - new Date(startedAt).getTime() < MAX_DETECTION_WINDOW_MS;
}

function bucket(intervalMs: number): number {
  return Math.floor(Date.now() / intervalMs);
}

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function kindToActivityFamily(kind: ActivityKind | null): ActivityFamily | null {
  switch (kind) {
    case "grandmaster":
      return "gm";
    case "nightfall":
      return "nightfall";
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
  const keys = [
    "objective",
    "objectives",
    "objective_score",
    "captures",
    "capture_points",
    "zones_captured",
    "zone_captures",
    "crests_recovered",
  ];
  for (const key of keys) {
    const value = valueOrNull(player.scoreboardValues[key]);
    if (value !== null) return value;
  }
  return null;
}

function placementWithinTeam(
  players: NormalizedPvpPgcrPlayer[],
  player: NormalizedPvpPgcrPlayer | null,
): number | null {
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

export function detectMercyOrLargeMargin(
  pgcr: NormalizedPvpPgcr,
  player: NormalizedPvpPgcrPlayer | null,
): boolean | null {
  if (!player || player.isWin !== true || player.team === null) return null;

  const ownTeam = pgcr.teams.find((team) => team.teamId === player.team);
  const ownScore = valueOrNull(ownTeam?.score);
  const opponentScores = pgcr.teams
    .filter((team) => team.teamId !== player.team)
    .map((team) => valueOrNull(team.score))
    .filter((score): score is number => score !== null);

  if (ownScore === null || opponentScores.length === 0) return null;
  const bestOpponentScore = Math.max(...opponentScores);
  const margin = ownScore - bestOpponentScore;
  const ratio = bestOpponentScore > 0 ? ownScore / bestOpponentScore : Infinity;
  return margin >= LARGE_SCORE_MARGIN || ratio >= LARGE_SCORE_RATIO;
}

export function finalizationPrerequisitesReady(
  run: Pick<ChallengeRun, "score" | "compliance_status">,
  participantUserIds: string[],
  legalityUserIds: Array<string | null>,
): boolean {
  if (run.score == null || run.compliance_status == null || participantUserIds.length === 0) return false;
  const legalUsers = new Set(legalityUserIds.filter((id): id is string => typeof id === "string"));
  return participantUserIds.every((id) => legalUsers.has(id));
}

async function loadRun(db: Db, runId: string): Promise<ChallengeRun | null> {
  const { data } = await db.from("challenge_runs").select("*").eq("id", runId).maybeSingle();
  return data ?? null;
}

async function loadParticipants(db: Db, runId: string): Promise<ParticipantRow[]> {
  const { data } = await db
    .from("challenge_run_participants")
    .select("user_id, bungie_membership_id, bungie_membership_type, character_id, is_owner")
    .eq("run_id", runId);
  return data ?? [];
}

async function loadParticipantByMembership(
  db: Db,
  runId: string,
  membershipId: string,
): Promise<ParticipantRow | null> {
  const { data } = await db
    .from("challenge_run_participants")
    .select("user_id, bungie_membership_id, bungie_membership_type, character_id, is_owner")
    .eq("run_id", runId)
    .eq("bungie_membership_id", membershipId)
    .maybeSingle();
  return data ?? null;
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

async function loadLoadoutSlots(db: Db, runId: string): Promise<ChallengeRunLoadoutSlot[]> {
  const { data } = await db.from("challenge_run_loadout_slots").select("*").eq("run_id", runId);
  return data ?? [];
}

async function loadNormalizedPgcr(db: Db, instanceId: string | null): Promise<NormalizedPgcr | null> {
  if (!instanceId) return null;
  const { data } = await db
    .from("pgcr_cache")
    .select("normalized_pgcr")
    .eq("instance_id", instanceId)
    .maybeSingle();
  return data?.normalized_pgcr ?? null;
}

async function loadLegality(
  db: Db,
  runId: string,
  userId: string,
): Promise<RunLegalityResult | null> {
  const { data } = await db
    .from("run_legality_results")
    .select("*")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function loadFireteamLegality(
  db: Db,
  runId: string,
  userId: string,
): Promise<RunLegalityResult[]> {
  const { data } = await db.from("run_legality_results").select("*").eq("run_id", runId);
  return (data ?? []).filter((row: RunLegalityResult) => row.user_id !== userId);
}

async function loadSnapshots(db: Db, runId: string, membershipId: string) {
  const { data } = await db
    .from("run_equipment_snapshots")
    .select("captured_at, bungie_membership_id, character_id, equipped")
    .eq("run_id", runId)
    .eq("bungie_membership_id", membershipId);
  return (data ?? []).map((snapshot: {
    captured_at: string;
    bungie_membership_id: string;
    character_id: string | null;
    equipped: unknown;
  }) => ({
    capturedAt: snapshot.captured_at,
    membershipId: snapshot.bungie_membership_id,
    characterId: snapshot.character_id ?? undefined,
    weapons: Array.isArray(snapshot.equipped) ? snapshot.equipped : [],
  }));
}

async function loadTrialsPassageSnapshots(
  db: Db,
  runId: string,
  userId: string,
): Promise<RunTrialsPassageSnapshot[]> {
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

async function loadLeaderboardEntry(db: Db, run: ChallengeRun, userId: string) {
  if (!run.weekly_challenge_id) return null;
  const [{ data: entry }, { count }] = await Promise.all([
    db
      .from("weekly_leaderboard_entries")
      .select("rank")
      .eq("weekly_challenge_id", run.weekly_challenge_id)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("weekly_leaderboard_entries")
      .select("id", { count: "exact", head: true })
      .eq("weekly_challenge_id", run.weekly_challenge_id),
  ]);
  if (!entry) return null;
  return { rank: entry.rank ?? null, totalEntries: count ?? 0 };
}

async function loadSeasonStreak(db: Db, run: ChallengeRun, userId: string): Promise<number> {
  if (!run.season_id) return 0;
  const { data } = await db
    .from("player_season_stats")
    .select("current_streak")
    .eq("user_id", userId)
    .eq("season_id", run.season_id)
    .maybeSingle();
  return data?.current_streak ?? 0;
}

async function loadComplianceResult(db: Db, runId: string, userId: string) {
  const { data } = await db
    .from("run_compliance_results")
    .select("status, weapon_usage_ratio")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function loadUserRuns(db: Db, userId: string) {
  const { data: participantRows } = await db
    .from("challenge_run_participants")
    .select("run_id")
    .eq("user_id", userId);
  const runIds = [...new Set((participantRows ?? []).map((row: { run_id: string }) => row.run_id))];
  if (runIds.length === 0) return [];
  const { data } = await db
    .from("challenge_runs")
    .select("id, activity_hash, completed_at, finalized_at, created_at")
    .in("id", runIds);
  return data ?? [];
}

async function loadUserLegalityRows(db: Db, userId: string) {
  const { data } = await db
    .from("run_legality_results")
    .select("run_id, is_valid")
    .eq("user_id", userId);
  return data ?? [];
}

function runTimestamp(run: Pick<ChallengeRun, "completed_at" | "finalized_at" | "created_at">): string {
  return run.completed_at ?? run.finalized_at ?? run.created_at;
}

async function computeCurrentValidStreak(
  db: Db,
  run: ChallengeRun,
  userId: string,
): Promise<number> {
  const [runs, legalityRows] = await Promise.all([
    loadUserRuns(db, userId),
    loadUserLegalityRows(db, userId),
  ]);
  const targetTime = new Date(runTimestamp(run)).getTime();
  const legalityByRun = new Map<string, boolean>(
    legalityRows.map((row: { run_id: string; is_valid: boolean }) => [row.run_id, row.is_valid]),
  );
  const ordered = runs
    .map((entry: {
      id: string;
      completed_at: string | null;
      finalized_at: string | null;
      created_at: string;
    }) => ({
      id: entry.id,
      time: new Date(entry.completed_at ?? entry.finalized_at ?? entry.created_at).getTime(),
    }))
    .filter((entry: { id: string; time: number }) =>
      Number.isFinite(entry.time) && entry.time <= targetTime && legalityByRun.has(entry.id),
    )
    .sort((a: { time: number }, b: { time: number }) => b.time - a.time);

  let streak = 0;
  for (const entry of ordered) {
    if (!legalityByRun.get(entry.id)) break;
    streak += 1;
  }
  return streak;
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
  return { weekScopeKey: reset.toISOString().slice(0, 10), startsAt: reset, endsAt };
}

async function computeWeeklyLegalityStats(
  db: Db,
  run: ChallengeRun,
  userId: string,
  family: ActivityFamily | null,
): Promise<{ weekScopeKey: string | null; weeklyMatchCount: number; weeklyValidMatchCount: number }> {
  if (family !== "iron_banner") {
    return { weekScopeKey: null, weeklyMatchCount: 0, weeklyValidMatchCount: 0 };
  }
  const anchor = new Date(runTimestamp(run));
  if (!Number.isFinite(anchor.getTime())) {
    return { weekScopeKey: null, weeklyMatchCount: 0, weeklyValidMatchCount: 0 };
  }

  const { weekScopeKey, startsAt, endsAt } = weekWindow(anchor);
  const [runs, legalityRows] = await Promise.all([
    loadUserRuns(db, userId),
    loadUserLegalityRows(db, userId),
  ]);
  const legalityByRun = new Map<string, boolean>(
    legalityRows.map((row: { run_id: string; is_valid: boolean }) => [row.run_id, row.is_valid]),
  );
  const inScope = runs.filter((entry: {
    id: string;
    activity_hash: number | null;
    completed_at: string | null;
    finalized_at: string | null;
    created_at: string;
  }) => {
    const time = new Date(entry.completed_at ?? entry.finalized_at ?? entry.created_at).getTime();
    if (!Number.isFinite(time) || time < startsAt.getTime() || time >= endsAt.getTime()) return false;
    return kindToActivityFamily(
      entry.activity_hash != null ? getActivityKindByHash(entry.activity_hash) : null,
    ) === family;
  });

  return {
    weekScopeKey,
    weeklyMatchCount: inScope.length,
    weeklyValidMatchCount: inScope.filter((entry: { id: string }) =>
      legalityByRun.get(entry.id) === true,
    ).length,
  };
}

async function ensureRunFinalized(db: Db, runId: string): Promise<ChallengeRun | null> {
  const run = await loadRun(db, runId);
  if (!run || TERMINAL_WITHOUT_AWARDS.has(run.status)) return null;
  if (run.status === "finalized") return run;

  const [participants, legalityRows] = await Promise.all([
    loadParticipants(db, runId),
    db.from("run_legality_results").select("user_id").eq("run_id", runId),
  ]);
  const legalities = legalityRows.data ?? [];
  const ready = finalizationPrerequisitesReady(
    run,
    participants.map((participant) => participant.user_id),
    legalities.map((row: { user_id: string | null }) => row.user_id),
  );
  if (!ready) {
    throw new Error(`run ${runId} prerequisites pending before finalization`);
  }

  const finalizedAt = new Date().toISOString();
  const { error } = await db
    .from("challenge_runs")
    .update({ status: "finalized", finalized_at: finalizedAt, updated_at: finalizedAt })
    .eq("id", runId);
  if (error) throw new Error(`failed to finalize run ${runId}: ${error.message}`);

  try {
    await db.from("challenge_run_events").insert({
      run_id: runId,
      event_type: "automatic_finalization",
      payload: { participant_count: participants.length },
    });
  } catch {
    // Audit writes are best-effort, matching the rest of the run lifecycle.
  }

  return { ...run, status: "finalized", finalized_at: finalizedAt, updated_at: finalizedAt };
}

async function buildParticipantContext(
  db: Db,
  run: ChallengeRun,
  participant: ParticipantRow,
  loadoutSlots: ChallengeRunLoadoutSlot[],
  pgcr: NormalizedPgcr | null,
): Promise<RerolledBadgeContext> {
  const [legality, fireteamLegality, snapshots, currentValidStreak, trialsPassageRows] = await Promise.all([
    loadLegality(db, run.id, participant.user_id),
    loadFireteamLegality(db, run.id, participant.user_id),
    loadSnapshots(db, run.id, participant.bungie_membership_id),
    computeCurrentValidStreak(db, run, participant.user_id),
    loadTrialsPassageSnapshots(db, run.id, participant.user_id),
  ]);

  const expectedWeapons = loadoutSlots.map((slot) => ({
    slot: slot.slot,
    weaponHash: slot.item_hash,
    weaponType: slot.weapon_type ?? undefined,
    optional: slot.is_wildcard,
  }));
  const snapshotResult = computeSnapshotCompliance({ snapshots, expectedWeapons });
  const activityHash = run.activity_hash ?? pgcr?.activityHash ?? null;
  const kind = activityHash != null ? getActivityKindByHash(activityHash) : null;
  const family = kindToActivityFamily(kind);
  const activityEntry = activityHash != null ? getActivityByHash(activityHash) : null;
  const modeKey = modeKeyForActivityName(activityEntry?.name);
  const pvpPlayer = pgcr?.kind === "pvp"
    ? pgcr.players.find((player) => player.membershipId === participant.bungie_membership_id) ?? null
    : null;

  const activity = {
    family,
    modeKey,
    isWin: pvpPlayer?.isWin ?? null,
    isCompleted: pgcr?.kind === "pve" ? pgcr.completed : pvpPlayer?.completed ?? null,
    defeats: pvpPlayer?.kills ?? null,
    teamPlacement: pgcr?.kind === "pvp" ? placementWithinTeam(pgcr.players, pvpPlayer) : null,
    totalTeams: pgcr?.kind === "pvp"
      ? (pgcr.teams.length || new Set(pgcr.players.map((player) => player.team).filter((value) => value !== null)).size || null)
      : null,
    medalKeys: pvpPlayer?.medalKeys ?? [],
    isUndefeated: pvpPlayer?.deaths != null ? pvpPlayer.deaths === 0 : null,
    isMercy: pgcr?.kind === "pvp" ? detectMercyOrLargeMargin(pgcr, pvpPlayer) : null,
    scoreLeadOnTeam: pgcr?.kind === "pvp"
      ? leadFlag(pgcr.players, pvpPlayer, (player) => player.score)
      : null,
    objectiveLeadOnTeam: pgcr?.kind === "pvp"
      ? leadFlag(pgcr.players, pvpPlayer, objectiveValue)
      : null,
    finalBlowLeadOnTeam: pgcr?.kind === "pvp"
      ? leadFlag(pgcr.players, pvpPlayer, (player) => player.kills)
      : null,
  };

  const weeklyStats = await computeWeeklyLegalityStats(db, run, participant.user_id, family);
  const preMatchPassages = trialsPassageRows
    .filter((row) => row.capture_phase === "pre_match")
    .map(toTrialsPassageSnapshot);
  const postMatchPassages = trialsPassageRows
    .filter((row) => row.capture_phase === "post_match")
    .map(toTrialsPassageSnapshot);
  const card = family === "trials"
    ? selectTrialsPassageCard({
        preMatchSnapshots: preMatchPassages,
        postMatchSnapshots: postMatchPassages,
        isWin: activity.isWin,
      })
    : null;

  const ownerEligible = run.created_by === participant.user_id && run.compliance_status === "eligible";
  return {
    run,
    legality,
    fireteamLegality,
    loadoutSlots,
    // An absent snapshot set is unknown, not a perfect zero-deviation run.
    snapshots: snapshotResult.totalSnapshots > 0
      ? {
          totalSnapshots: snapshotResult.totalSnapshots,
          offLoadoutSnapshots: snapshotResult.offLoadoutSnapshots,
        }
      : null,
    activity,
    card,
    currentValidStreak,
    leaderboardEligible: ownerEligible,
    weeklyChallengeVerified: ownerEligible && run.mode === "weekly_challenge",
    weeklyMatchCount: weeklyStats.weeklyMatchCount,
    weeklyValidMatchCount: weeklyStats.weeklyValidMatchCount,
    weekScopeKey: weeklyStats.weekScopeKey,
  };
}

export const awardBadgesForAllParticipantsHandler: JobHandler = async (job, db) => {
  if (!job.run_id) return;
  const run = await ensureRunFinalized(db, job.run_id);
  if (!run) return;

  // Leaderboard placement is an input to the legacy Top 10% badge. Running the
  // idempotent leaderboard upsert here removes any ordering dependency between
  // the two jobs when multiple workers drain the queue concurrently.
  await updateLeaderboardHandler(job, db);

  const [participants, loadoutSlots, badgeRows, pgcr] = await Promise.all([
    loadParticipants(db, run.id),
    loadLoadoutSlots(db, run.id),
    loadAllBadges(db),
    loadNormalizedPgcr(db, run.pgcr_instance_id),
  ]);
  const rerolledRows = badgeRows.filter((badge) => badge.mode !== null);
  const inserts: Array<ReturnType<typeof buildPlayerBadgeInsert>> = [];

  for (const participant of participants) {
    const [leaderboardEntry, currentStreak, complianceResult] = await Promise.all([
      loadLeaderboardEntry(db, run, participant.user_id),
      loadSeasonStreak(db, run, participant.user_id),
      loadComplianceResult(db, run.id, participant.user_id),
    ]);

    const legacyResults = evaluateBadges({
      run,
      loadoutSlots,
      complianceResult,
      leaderboardEntry,
      currentStreak,
    });
    const rerolledContext = await buildParticipantContext(
      db,
      run,
      participant,
      loadoutSlots,
      pgcr,
    );

    const legacyBadgeIds = new Map(
      badgeRows
        .filter((badge) => legacyResults.some((result) => result.slug === badge.slug))
        .map((badge) => [badge.slug, badge.id]),
    );
    for (const result of legacyResults) {
      const badgeId = legacyBadgeIds.get(result.slug);
      if (!badgeId) continue;
      inserts.push(
        buildPlayerBadgeInsert(
          participant.user_id,
          participant.bungie_membership_id,
          badgeId,
          result.decision,
          {
            runId: run.id,
            weeklyChallengeId: run.weekly_challenge_id,
            seasonId: run.season_id,
          },
        ),
      );
    }

    for (const badge of rerolledRows) {
      if (badge.criteria?.rule === "manual_grant") continue;
      try {
        const decision = evaluateRerolledBadge(badge.criteria, rerolledContext);
        if (!decision.awarded) continue;
        inserts.push(
          buildPlayerBadgeInsert(
            participant.user_id,
            participant.bungie_membership_id,
            badge.id,
            decision,
            {
              runId: run.id,
              weeklyChallengeId: run.weekly_challenge_id,
              seasonId: run.season_id,
            },
          ),
        );
      } catch (error) {
        console.warn(
          `[worker] badge evaluation failed for ${badge.slug}, user ${participant.user_id}, run ${run.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  if (inserts.length > 0) {
    await db
      .from("player_badges")
      .upsert(inserts, { onConflict: "user_id,badge_id,scope_key", ignoreDuplicates: true });
  }
};

export const finalizedLeaderboardHandler: JobHandler = async (job, db) => {
  if (!job.run_id) return;
  const run = await ensureRunFinalized(db, job.run_id);
  if (!run) return;
  await updateLeaderboardHandler(job, db);
};

async function captureEquipmentSnapshotForParticipant(job: WorkerJobRow, db: Db) {
  const payload = job.payload as {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
  };
  const [run, participant] = await Promise.all([
    loadRun(db, payload.runId),
    loadParticipantByMembership(db, payload.runId, payload.membershipId),
  ]);
  if (!run || !participant) return;

  const token = await getBungieToken(participant.user_id, payload.membershipId);
  const client = new BungieWorkerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = await client.get(
    `/Destiny2/${payload.membershipType}/Profile/${payload.membershipId}/?components=205`,
    token,
  );
  const items: Array<{ itemHash: number; bucketHash: number }> =
    profile?.characterEquipment?.data?.[payload.characterId]?.items ?? [];
  const equipped = items
    .map((item) => ({ slot: bucketToSlot(item.bucketHash), weaponHash: item.itemHash }))
    .filter((weapon): weapon is { slot: WeaponSlot; weaponHash: number } => Boolean(weapon.slot));
  const loadoutSlots = await loadLoadoutSlots(db, payload.runId);
  const expected = loadoutSlots.map((slot) => ({
    slot: slot.slot,
    weaponHash: slot.item_hash,
    weaponType: slot.weapon_type ?? undefined,
    optional: slot.is_wildcard,
  }));

  await db.from("run_equipment_snapshots").insert({
    run_id: payload.runId,
    user_id: participant.user_id,
    bungie_membership_id: payload.membershipId,
    bungie_membership_type: payload.membershipType,
    character_id: payload.characterId,
    captured_at: new Date().toISOString(),
    equipped,
    expected,
  });

  // The owner's first snapshot is the fan-out point for authenticated fireteam
  // members. Each participant then self-reschedules independently.
  if (participant.is_owner) {
    const participants = await loadParticipants(db, payload.runId);
    for (const teammate of participants) {
      if (
        teammate.user_id === participant.user_id ||
        !teammate.bungie_membership_id ||
        !teammate.character_id
      ) {
        continue;
      }
      const base = {
        runId: payload.runId,
        membershipId: teammate.bungie_membership_id,
        membershipType: teammate.bungie_membership_type ?? 3,
        characterId: teammate.character_id,
      };
      await enqueueJob(
        {
          jobType: "capture_equipment_snapshot",
          runId: payload.runId,
          payload: base,
          dedupeKey: `capture-initial:${payload.runId}:${teammate.user_id}`,
        },
        db,
      );
      await enqueueJob(
        {
          jobType: "capture_trials_passage_snapshot",
          runId: payload.runId,
          payload: { ...base, capturePhase: "pre_match" },
          dedupeKey: `trials-pre:${payload.runId}:${teammate.user_id}`,
        },
        db,
      );
    }
  }

  if (["applied", "in_activity"].includes(run.status) && withinWindow(run.started_at)) {
    await enqueueJob(
      {
        jobType: "capture_equipment_snapshot",
        runId: payload.runId,
        payload,
        runAt: new Date(Date.now() + SNAPSHOT_INTERVAL_MS).toISOString(),
        dedupeKey: `capture:${payload.runId}:${participant.user_id}:${bucket(SNAPSHOT_INTERVAL_MS)}`,
      },
      db,
    );
  }
}

async function captureTrialsPassageSnapshotForParticipant(job: WorkerJobRow, db: Db) {
  const payload = job.payload as {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
    capturePhase: TrialsPassageCapturePhase;
  };
  const participant = await loadParticipantByMembership(db, payload.runId, payload.membershipId);
  if (!participant) return;

  const token = await getBungieToken(participant.user_id, payload.membershipId);
  const client = new BungieWorkerClient();
  const profile = await client.get<BungieProfileResponse>(
    `/Destiny2/${payload.membershipType}/Profile/${payload.membershipId}/?components=${TRIALS_PASSAGE_PROFILE_COMPONENTS}`,
    token,
  );
  const snapshots = extractTrialsPassageSnapshots(profile);
  if (!snapshots.length) return;
  const capturedAt = new Date().toISOString();

  await db.from("run_trials_passage_snapshots").upsert(
    snapshots.map((snapshot) => ({
      run_id: payload.runId,
      user_id: participant.user_id,
      bungie_membership_id: payload.membershipId,
      capture_phase: payload.capturePhase,
      passage_instance_id: snapshot.passageInstanceId,
      passage_item_hash: snapshot.passageItemHash,
      passage_name: snapshot.passageName,
      bucket_hash: snapshot.bucketHash,
      character_id: snapshot.characterId,
      wins: snapshot.wins,
      rounds_won: snapshot.roundsWon,
      active_win_streak: snapshot.activeWinStreak,
      flawless_win_streak: snapshot.flawlessWinStreak,
      flawless_progress: snapshot.flawlessProgress,
      is_flawless: snapshot.isFlawless,
      is_complete: snapshot.isComplete,
      trials_multiplier: snapshot.trialsMultiplier,
      raw_objectives: snapshot.objectiveProgress,
      captured_at: capturedAt,
    })),
    { onConflict: "run_id,user_id,capture_phase,passage_instance_id" },
  );
}

async function parsePgcrAndFanOutPostMatch(job: WorkerJobRow, db: Db) {
  await parsePgcrHandler(job, { db });
  if (!job.run_id) return;
  const participants = await loadParticipants(db, job.run_id);
  for (const participant of participants) {
    if (!participant.bungie_membership_id || !participant.character_id) continue;
    await enqueueJob(
      {
        jobType: "capture_trials_passage_snapshot",
        runId: job.run_id,
        payload: {
          runId: job.run_id,
          membershipId: participant.bungie_membership_id,
          membershipType: participant.bungie_membership_type ?? 3,
          characterId: participant.character_id,
          capturePhase: "post_match",
        },
        dedupeKey: `trials-post:${job.run_id}:${participant.user_id}`,
      },
      db,
    );
  }
}

const automaticHandlers: Partial<Record<ScoreAttackJobType, JobHandler>> = {
  capture_equipment_snapshot: captureEquipmentSnapshotForParticipant,
  capture_trials_passage_snapshot: captureTrialsPassageSnapshotForParticipant,
  parse_pgcr: parsePgcrAndFanOutPostMatch,
  update_leaderboard: finalizedLeaderboardHandler,
  award_badges: awardBadgesForAllParticipantsHandler,
};

export function getAutomaticHandler(jobType: ScoreAttackJobType): JobHandler | undefined {
  return automaticHandlers[jobType] ?? getBaseHandler(jobType);
}
