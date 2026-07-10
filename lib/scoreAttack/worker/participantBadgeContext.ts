import { computeSnapshotCompliance } from "@/lib/scoreAttack/compliance";
import { getActivityByHash, getActivityKindByHash, type ActivityKind } from "@/lib/scoreAttack/activityPool";
import { selectTrialsPassageCard, type TrialsPassageSnapshot } from "@/lib/scoreAttack/trialsPassages";
import type { NormalizedPgcr, NormalizedPvpPgcr, NormalizedPvpPgcrPlayer } from "@/lib/scoreAttack/types";
import type {
  ActivityFamily,
  ChallengeRun,
  ChallengeRunLoadoutSlot,
  RunLegalityResult,
  RunTrialsPassageSnapshot,
} from "@/types/challenges";
import type { RerolledBadgeContext } from "@/lib/badges/rerolledEvaluators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BadgeDb = any;

export interface ParticipantRow {
  user_id: string;
  bungie_membership_id: string;
  bungie_membership_type: number | null;
  character_id: string | null;
  is_owner: boolean;
}

export interface BadgeRow {
  id: string;
  slug: string;
  criteria: Record<string, unknown>;
  mode: string | null;
}

const LARGE_SCORE_MARGIN = 50;
const LARGE_SCORE_RATIO = 1.5;

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function activityFamily(kind: ActivityKind | null, name: string | null | undefined): ActivityFamily | null {
  if (kind === "grandmaster") return "gm";
  if (kind === "vanguard-op" && name?.toLowerCase().includes("nightfall")) return "nightfall";
  switch (kind) {
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

function modeKey(name: string | null | undefined): string | null {
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
  const peers = player.team === null ? [player] : players.filter((entry) => entry.team === player.team);
  const values = peers.map(selector).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) === current : null;
}

function objectiveValue(player: NormalizedPvpPgcrPlayer): number | null {
  for (const key of [
    "objective",
    "objectives",
    "objective_score",
    "captures",
    "capture_points",
    "zones_captured",
    "zone_captures",
    "crests_recovered",
  ]) {
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
  const ranked = players
    .filter((entry) => entry.team === player.team)
    .sort((a, b) => {
      const score = (b.score ?? -Infinity) - (a.score ?? -Infinity);
      return score || (b.kills ?? -Infinity) - (a.kills ?? -Infinity);
    });
  const index = ranked.findIndex((entry) => entry.membershipId === player.membershipId);
  return index < 0 ? null : index + 1;
}

export function detectMercyOrLargeMargin(
  pgcr: NormalizedPvpPgcr,
  player: NormalizedPvpPgcrPlayer | null,
): boolean | null {
  if (!player || player.isWin !== true || player.team === null) return null;
  const ownScore = valueOrNull(pgcr.teams.find((team) => team.teamId === player.team)?.score);
  const opponents = pgcr.teams
    .filter((team) => team.teamId !== player.team)
    .map((team) => valueOrNull(team.score))
    .filter((score): score is number => score !== null);
  if (ownScore === null || opponents.length === 0) return null;
  const opponent = Math.max(...opponents);
  return ownScore - opponent >= LARGE_SCORE_MARGIN || (opponent > 0 ? ownScore / opponent : Infinity) >= LARGE_SCORE_RATIO;
}

export function finalizationPrerequisitesReady(
  run: Pick<ChallengeRun, "score" | "compliance_status">,
  participantUserIds: string[],
  legalityUserIds: Array<string | null>,
): boolean {
  if (run.score == null || run.compliance_status == null || participantUserIds.length === 0) return false;
  const ready = new Set(legalityUserIds.filter((id): id is string => id !== null));
  return participantUserIds.every((id) => ready.has(id));
}

export async function loadRun(db: BadgeDb, runId: string): Promise<ChallengeRun | null> {
  const { data } = await db.from("challenge_runs").select("*").eq("id", runId).maybeSingle();
  return data ?? null;
}

export async function loadParticipants(db: BadgeDb, runId: string): Promise<ParticipantRow[]> {
  const { data } = await db
    .from("challenge_run_participants")
    .select("user_id, bungie_membership_id, bungie_membership_type, character_id, is_owner")
    .eq("run_id", runId);
  return data ?? [];
}

export async function loadParticipantByMembership(
  db: BadgeDb,
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

export async function loadAllBadges(db: BadgeDb): Promise<BadgeRow[]> {
  const { data } = await db.from("badges").select("id, slug, criteria, mode");
  return (data ?? []).map((badge: BadgeRow) => ({ ...badge, criteria: badge.criteria ?? {}, mode: badge.mode ?? null }));
}

export async function loadLoadoutSlots(db: BadgeDb, runId: string): Promise<ChallengeRunLoadoutSlot[]> {
  const { data } = await db.from("challenge_run_loadout_slots").select("*").eq("run_id", runId);
  return data ?? [];
}

export async function loadNormalizedPgcr(db: BadgeDb, instanceId: string | null): Promise<NormalizedPgcr | null> {
  if (!instanceId) return null;
  const { data } = await db.from("pgcr_cache").select("normalized_pgcr").eq("instance_id", instanceId).maybeSingle();
  return data?.normalized_pgcr ?? null;
}

export async function loadLeaderboardEntry(db: BadgeDb, run: ChallengeRun, userId: string) {
  if (!run.weekly_challenge_id) return null;
  const [{ data: entry }, { count }] = await Promise.all([
    db.from("weekly_leaderboard_entries").select("rank").eq("weekly_challenge_id", run.weekly_challenge_id).eq("user_id", userId).maybeSingle(),
    db.from("weekly_leaderboard_entries").select("id", { count: "exact", head: true }).eq("weekly_challenge_id", run.weekly_challenge_id),
  ]);
  return entry ? { rank: entry.rank ?? null, totalEntries: count ?? 0 } : null;
}

export async function loadSeasonStreak(db: BadgeDb, run: ChallengeRun, userId: string): Promise<number> {
  if (!run.season_id) return 0;
  const { data } = await db.from("player_season_stats").select("current_streak").eq("user_id", userId).eq("season_id", run.season_id).maybeSingle();
  return data?.current_streak ?? 0;
}

export async function loadComplianceResult(db: BadgeDb, runId: string, userId: string) {
  const { data } = await db.from("run_compliance_results").select("status, weapon_usage_ratio").eq("run_id", runId).eq("user_id", userId).maybeSingle();
  return data ?? null;
}

async function loadLegality(db: BadgeDb, runId: string, userId: string): Promise<RunLegalityResult | null> {
  const { data } = await db.from("run_legality_results").select("*").eq("run_id", runId).eq("user_id", userId).maybeSingle();
  return data ?? null;
}

async function loadFireteamLegality(db: BadgeDb, runId: string, userId: string): Promise<RunLegalityResult[]> {
  const { data } = await db.from("run_legality_results").select("*").eq("run_id", runId);
  return (data ?? []).filter((row: RunLegalityResult) => row.user_id !== userId);
}

async function loadSnapshots(db: BadgeDb, runId: string, membershipId: string) {
  const { data } = await db
    .from("run_equipment_snapshots")
    .select("captured_at, bungie_membership_id, character_id, equipped")
    .eq("run_id", runId)
    .eq("bungie_membership_id", membershipId);
  return (data ?? []).map((row: { captured_at: string; bungie_membership_id: string; character_id: string | null; equipped: unknown }) => ({
    capturedAt: row.captured_at,
    membershipId: row.bungie_membership_id,
    characterId: row.character_id ?? undefined,
    weapons: Array.isArray(row.equipped) ? row.equipped : [],
  }));
}

async function loadTrialsRows(db: BadgeDb, runId: string, userId: string): Promise<RunTrialsPassageSnapshot[]> {
  const { data } = await db.from("run_trials_passage_snapshots").select("*").eq("run_id", runId).eq("user_id", userId);
  return data ?? [];
}

function passage(row: RunTrialsPassageSnapshot): TrialsPassageSnapshot {
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

async function participantRuns(db: BadgeDb, userId: string) {
  const { data: rows } = await db.from("challenge_run_participants").select("run_id").eq("user_id", userId);
  const ids = [...new Set((rows ?? []).map((row: { run_id: string }) => row.run_id))];
  if (!ids.length) return [];
  const { data } = await db.from("challenge_runs").select("id, activity_hash, completed_at, finalized_at, created_at").in("id", ids);
  return data ?? [];
}

async function userLegalities(db: BadgeDb, userId: string) {
  const { data } = await db.from("run_legality_results").select("run_id, is_valid").eq("user_id", userId);
  return data ?? [];
}

function timestamp(run: Pick<ChallengeRun, "completed_at" | "finalized_at" | "created_at">): string {
  return run.completed_at ?? run.finalized_at ?? run.created_at;
}

async function validStreak(db: BadgeDb, run: ChallengeRun, userId: string): Promise<number> {
  const [runs, legalities] = await Promise.all([participantRuns(db, userId), userLegalities(db, userId)]);
  const byRun = new Map<string, boolean>(legalities.map((row: { run_id: string; is_valid: boolean }) => [row.run_id, row.is_valid]));
  const limit = new Date(timestamp(run)).getTime();
  const ordered = runs
    .map((row: { id: string; completed_at: string | null; finalized_at: string | null; created_at: string }) => ({
      id: row.id,
      time: new Date(row.completed_at ?? row.finalized_at ?? row.created_at).getTime(),
    }))
    .filter((row: { id: string; time: number }) => Number.isFinite(row.time) && row.time <= limit && byRun.has(row.id))
    .sort((a: { time: number }, b: { time: number }) => b.time - a.time);
  let count = 0;
  for (const row of ordered) {
    if (!byRun.get(row.id)) break;
    count += 1;
  }
  return count;
}

function week(date: Date) {
  const start = new Date(date);
  start.setUTCHours(17, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 5) % 7));
  if (date.getTime() < start.getTime()) start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { key: start.toISOString().slice(0, 10), start, end };
}

async function weeklyStats(db: BadgeDb, run: ChallengeRun, userId: string, family: ActivityFamily | null) {
  if (family !== "iron_banner") return { key: null, matches: 0, valid: 0 };
  const anchor = new Date(timestamp(run));
  if (!Number.isFinite(anchor.getTime())) return { key: null, matches: 0, valid: 0 };
  const [{ key, start, end }, runs, legalities] = await Promise.all([
    Promise.resolve(week(anchor)),
    participantRuns(db, userId),
    userLegalities(db, userId),
  ]);
  const byRun = new Map<string, boolean>(legalities.map((row: { run_id: string; is_valid: boolean }) => [row.run_id, row.is_valid]));
  const scoped = runs.filter((row: { id: string; activity_hash: number | null; completed_at: string | null; finalized_at: string | null; created_at: string }) => {
    const time = new Date(row.completed_at ?? row.finalized_at ?? row.created_at).getTime();
    if (time < start.getTime() || time >= end.getTime()) return false;
    const activity = row.activity_hash == null ? null : getActivityByHash(row.activity_hash);
    return activityFamily(activity?.kind ?? null, activity?.name) === "iron_banner";
  });
  return { key, matches: scoped.length, valid: scoped.filter((row: { id: string }) => byRun.get(row.id) === true).length };
}

export async function buildParticipantBadgeContext(
  db: BadgeDb,
  run: ChallengeRun,
  participant: ParticipantRow,
  slots: ChallengeRunLoadoutSlot[],
  pgcr: NormalizedPgcr | null,
): Promise<RerolledBadgeContext> {
  const [legality, fireteamLegality, snapshots, streak, trialsRows] = await Promise.all([
    loadLegality(db, run.id, participant.user_id),
    loadFireteamLegality(db, run.id, participant.user_id),
    loadSnapshots(db, run.id, participant.bungie_membership_id),
    validStreak(db, run, participant.user_id),
    loadTrialsRows(db, run.id, participant.user_id),
  ]);
  const expectedWeapons = slots.map((slot) => ({ slot: slot.slot, weaponHash: slot.item_hash, weaponType: slot.weapon_type ?? undefined, optional: slot.is_wildcard }));
  const snapshotResult = computeSnapshotCompliance({ snapshots, expectedWeapons });
  const hash = run.activity_hash ?? pgcr?.activityHash ?? null;
  const catalogActivity = hash == null ? null : getActivityByHash(hash);
  const kind = hash == null ? null : getActivityKindByHash(hash);
  const family = activityFamily(kind, catalogActivity?.name);
  const player = pgcr?.kind === "pvp" ? pgcr.players.find((entry) => entry.membershipId === participant.bungie_membership_id) ?? null : null;
  const activity = {
    family,
    modeKey: modeKey(catalogActivity?.name),
    isWin: player?.isWin ?? null,
    isCompleted: pgcr?.kind === "pve" ? pgcr.completed : player?.completed ?? null,
    defeats: player?.kills ?? null,
    teamPlacement: pgcr?.kind === "pvp" ? placementWithinTeam(pgcr.players, player) : null,
    totalTeams: pgcr?.kind === "pvp" ? (pgcr.teams.length || null) : null,
    medalKeys: player?.medalKeys ?? [],
    isUndefeated: player?.deaths == null ? null : player.deaths === 0,
    isMercy: pgcr?.kind === "pvp" ? detectMercyOrLargeMargin(pgcr, player) : null,
    scoreLeadOnTeam: pgcr?.kind === "pvp" ? leadFlag(pgcr.players, player, (entry) => entry.score) : null,
    objectiveLeadOnTeam: pgcr?.kind === "pvp" ? leadFlag(pgcr.players, player, objectiveValue) : null,
    finalBlowLeadOnTeam: pgcr?.kind === "pvp" ? leadFlag(pgcr.players, player, (entry) => entry.kills) : null,
  };
  const weekly = await weeklyStats(db, run, participant.user_id, family);
  const card = family === "trials"
    ? selectTrialsPassageCard({
        preMatchSnapshots: trialsRows.filter((row) => row.capture_phase === "pre_match").map(passage),
        postMatchSnapshots: trialsRows.filter((row) => row.capture_phase === "post_match").map(passage),
        isWin: activity.isWin,
      })
    : null;
  const ownerEligible = run.created_by === participant.user_id && run.compliance_status === "eligible";
  return {
    run,
    legality,
    fireteamLegality,
    loadoutSlots: slots,
    snapshots: snapshotResult.totalSnapshots > 0 ? { totalSnapshots: snapshotResult.totalSnapshots, offLoadoutSnapshots: snapshotResult.offLoadoutSnapshots } : null,
    activity,
    card,
    currentValidStreak: streak,
    leaderboardEligible: ownerEligible,
    weeklyChallengeVerified: ownerEligible && run.mode === "weekly_challenge",
    weeklyMatchCount: weekly.matches,
    weeklyValidMatchCount: weekly.valid,
    weekScopeKey: weekly.key,
  };
}
