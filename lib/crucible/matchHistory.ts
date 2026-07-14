import { adminSupabase } from "@/lib/supabase/admin";
import { resolveActivity } from "@/lib/bungie/pgcr";
import type { SeasonMatch, SeasonMatchLoadoutSlot, SeasonMatchPlayer } from "@/types/platform";

function buildTrialsReportUrl(membershipType: number | null, membershipId: string): string | null {
  if (membershipType === null || !membershipId) return null;
  return `https://destinytrialsreport.com/report/${membershipType}/${membershipId}`;
}
import { classifyCrucibleMode, crucibleModeName } from "./modes";
import { getHeadToHeadSummaries } from "./headToHead";
import type { CrucibleModeBucket, CrucibleSyncState } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface MatchRow {
  instance_id: string;
  activity_hash: number | null;
  director_activity_hash: number | null;
  activity_name: string | null;
  activity_image?: string | null;
  activity_mode: number | null;
  activity_modes: number[] | null;
  mode_bucket: CrucibleModeBucket;
  period: string;
  team_data: unknown;
  is_private: boolean;
}

interface PlayerRow {
  instance_id: string;
  membership_id: string;
  membership_type: number | null;
  display_name: string;
  emblem_path: string | null;
  team_id: number | null;
  is_win: boolean | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
}

interface LinkedRunRow {
  id: string;
  pgcr_instance_id: string;
  weekly_challenge_id: string | null;
  lobby_id: string | null;
}

interface LinkedGameSessionRow {
  id: string;
  pgcr_instance_id: string;
  lobby_id: string;
}

function kd(kills: number | null, deaths: number | null): number | null {
  if (kills === null || deaths === null) return null;
  return deaths === 0 ? kills : Math.round((kills / deaths) * 100) / 100;
}

function scoreForTeam(teamData: unknown, teamId: number | null): number | null {
  if (teamId === null || !Array.isArray(teamData)) return null;
  const row = teamData.find((team) => team && typeof team === "object" && (team as { teamId?: unknown }).teamId === teamId);
  const score = row && typeof row === "object" ? (row as { score?: unknown }).score : null;
  return typeof score === "number" ? score : null;
}

function sortPlayers(players: SeasonMatchPlayer[]) {
  return players.sort((a, b) => (b.kills ?? -1) - (a.kills ?? -1));
}

async function repairStaleModeBuckets(
  rows: MatchRow[],
  db: Db,
  resolveDef: typeof resolveActivity,
): Promise<MatchRow[]> {
  const hashes = [...new Set(rows
    .filter((row) => row.mode_bucket === "other")
    .flatMap((row) => [row.activity_hash, row.director_activity_hash])
    .filter((hash): hash is number => hash !== null)
    .map(Number))];
  if (hashes.length === 0) return rows;

  const definitions = new Map<number, Awaited<ReturnType<typeof resolveActivity>>>();
  await Promise.all(hashes.map(async (hash) => {
    definitions.set(hash, await resolveDef(hash));
  }));

  return Promise.all(rows.map(async (row) => {
    if (row.mode_bucket !== "other") return row;

    const activityModes = [...new Set([
      ...(row.activity_modes ?? []),
      ...(row.activity_hash === null ? [] : definitions.get(Number(row.activity_hash))?.modes ?? []),
      ...(row.director_activity_hash === null ? [] : definitions.get(Number(row.director_activity_hash))?.modes ?? []),
    ])];
    const modeBucket = classifyCrucibleMode({
      activityMode: row.activity_mode,
      activityModes,
      activityHash: row.activity_hash === null ? null : Number(row.activity_hash),
      activityName: row.activity_name,
      directorActivityName: row.director_activity_hash === null
        ? null
        : definitions.get(Number(row.director_activity_hash))?.name ?? null,
    });
    const modesChanged = activityModes.length !== (row.activity_modes ?? []).length
      || activityModes.some((mode) => !(row.activity_modes ?? []).includes(mode));
    if (modeBucket === row.mode_bucket && !modesChanged) return row;

    const repaired = { ...row, activity_modes: activityModes, mode_bucket: modeBucket };
    try {
      const now = new Date().toISOString();
      const updates = [
        db.from("crucible_matches").update({
          activity_modes: activityModes,
          mode_bucket: modeBucket,
          updated_at: now,
        }).eq("instance_id", row.instance_id),
      ];
      if (modeBucket !== row.mode_bucket) {
        updates.push(
          db.from("crucible_encounters").update({ mode_bucket: modeBucket }).eq("instance_id", row.instance_id),
        );
      }
      await Promise.all(updates);
    } catch (error) {
      console.warn(
        `[crucible/history] failed to persist repaired mode for ${row.instance_id}:`,
        error instanceof Error ? error.message : error,
      );
    }
    return repaired;
  }));
}

export async function getCrucibleMatchHistory(
  userId: string,
  options: { limit?: number; db?: Db; resolveActivityDef?: typeof resolveActivity } = {},
): Promise<{ matches: SeasonMatch[]; syncStatus: SeasonStatsSyncStatus }> {
  const db = options.db ?? adminSupabase;
  const resolveDef = options.resolveActivityDef ?? resolveActivity;
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 50);
  const [{ data: account, error: accountError }, { data: syncState }] = await Promise.all([
    db.from("bungie_accounts").select("membership_id").eq("user_id", userId).maybeSingle(),
    db.from("crucible_sync_state").select("status").eq("user_id", userId).maybeSingle(),
  ]);
  if (accountError || !account?.membership_id) return { matches: [], syncStatus: "idle" };
  const syncStatus = ((syncState as Pick<CrucibleSyncState, "status"> | null)?.status ?? "idle") as SeasonStatsSyncStatus;

  const { data: encounterRows, error: encounterError } = await db.from("crucible_encounters")
    .select("instance_id, played_at")
    .eq("viewer_user_id", userId)
    .order("played_at", { ascending: false })
    .limit(limit * 12);
  if (encounterError) throw new Error(`Crucible history lookup failed: ${encounterError.message}`);
  const instanceIds = [...new Set((encounterRows ?? []).map((row: { instance_id: string }) => row.instance_id))].slice(0, limit);
  if (instanceIds.length === 0) return { matches: [], syncStatus };

  // activity_image (migration 050) is additive; if it hasn't been applied yet,
  // fall back to a select without it rather than failing the whole report.
  const matchCols = "instance_id, activity_hash, activity_name, activity_mode, activity_modes, mode_bucket, period, team_data, is_private";
  let optionalMatchCols = ["activity_image", "director_activity_hash"];
  let matchSelect = await db.from("crucible_matches").select(`${matchCols}, ${optionalMatchCols.join(", ")}`).in("instance_id", instanceIds).eq("is_private", false);
  while (matchSelect.error && optionalMatchCols.some((column) => (matchSelect.error.message ?? "").includes(column))) {
    optionalMatchCols = optionalMatchCols.filter((column) => !(matchSelect.error.message ?? "").includes(column));
    matchSelect = await db.from("crucible_matches").select([matchCols, ...optionalMatchCols].join(", ")).in("instance_id", instanceIds).eq("is_private", false);
  }
  const { data: rawMatchRows, error: matchError } = matchSelect;

  const [{ data: playerRows, error: playerError }, { data: runRows }, { data: gameSessionRows }] = await Promise.all([
    db.from("crucible_match_players").select("instance_id, membership_id, membership_type, display_name, emblem_path, team_id, is_win, kills, deaths, assists").in("instance_id", instanceIds),
    db.from("challenge_runs").select("id, pgcr_instance_id, weekly_challenge_id, lobby_id").in("pgcr_instance_id", instanceIds),
    db.from("game_sessions").select("id, pgcr_instance_id, lobby_id").in("pgcr_instance_id", instanceIds),
  ]);
  if (matchError) throw new Error(`Crucible match lookup failed: ${matchError.message}`);
  if (playerError) throw new Error(`Crucible roster lookup failed: ${playerError.message}`);

  const matchRows = await repairStaleModeBuckets((rawMatchRows ?? []) as MatchRow[], db, resolveDef);
  const linkedRuns = (runRows ?? []) as LinkedRunRow[];
  const linkedGameSessions = (gameSessionRows ?? []) as LinkedGameSessionRow[];
  const lobbyIds = [...new Set([
    ...linkedGameSessions.map((row) => row.lobby_id),
    ...linkedRuns.flatMap((row) => row.lobby_id ? [row.lobby_id] : []),
  ])];
  const runIds = linkedRuns.map((row) => row.id);
  const challengeIds = linkedRuns.flatMap((row) => row.weekly_challenge_id ? [row.weekly_challenge_id] : []);
  const [{ data: loadoutRows }, { data: challengeRows }, { data: lobbyRows }] = await Promise.all([
    runIds.length ? db.from("challenge_run_loadout_slots").select("run_id, slot, weapon_name, weapon_icon").in("run_id", runIds) : Promise.resolve({ data: [] }),
    challengeIds.length ? db.from("weekly_challenges").select("id, title").in("id", challengeIds) : Promise.resolve({ data: [] }),
    lobbyIds.length ? db.from("lobbies").select("id, mode").in("id", lobbyIds) : Promise.resolve({ data: [] }),
  ]);
  const runByInstance = new Map<string, LinkedRunRow>(linkedRuns.map((row) => [row.pgcr_instance_id, row]));
  const gameSessionByInstance = new Map<string, LinkedGameSessionRow>(linkedGameSessions.map((row) => [row.pgcr_instance_id, row]));
  const lobbyModeById = new Map<string, "roulette" | "draft">(((lobbyRows ?? []) as { id: string; mode: "roulette" | "draft" }[]).map((row) => [row.id, row.mode]));
  const challengeById = new Map<string, string>(((challengeRows ?? []) as { id: string; title: string }[]).map((row) => [row.id, row.title]));
  const loadoutByRun = new Map<string, SeasonMatchLoadoutSlot[]>();
  for (const row of loadoutRows ?? []) {
    const list = loadoutByRun.get(row.run_id) ?? [];
    list.push({ slot: row.slot, name: row.weapon_name, icon: row.weapon_icon });
    loadoutByRun.set(row.run_id, list);
  }
  const playersByInstance = new Map<string, PlayerRow[]>();
  for (const row of (playerRows ?? []) as PlayerRow[]) {
    const list = playersByInstance.get(row.instance_id) ?? [];
    list.push(row);
    playersByInstance.set(row.instance_id, list);
  }
  const typedPlayers = (playerRows ?? []) as PlayerRow[];
  const opponentIds: string[] = [...new Set(typedPlayers
    .filter((row: PlayerRow) => row.membership_id !== account.membership_id)
    .map((row: PlayerRow) => row.membership_id))];
  const h2h = await getHeadToHeadSummaries({ viewerUserId: userId, opponentMembershipIds: opponentIds, db });

  const matches = matchRows.map((match): SeasonMatch | null => {
    const rows = playersByInstance.get(match.instance_id) ?? [];
    const viewer = rows.find((row) => row.membership_id === account.membership_id);
    if (!viewer || viewer.team_id === null) return null;
    const toPlayer = (row: PlayerRow): SeasonMatchPlayer => ({
      membershipId: row.membership_id,
      membershipType: row.membership_type,
      displayName: row.display_name,
      emblemPath: row.emblem_path,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      kd: kd(row.kills, row.deaths),
      isCurrentUser: row.membership_id === account.membership_id,
      isOnViewerTeam: row.team_id === viewer.team_id,
      trialsReportUrl: buildTrialsReportUrl(row.membership_type, row.membership_id),
      // Head-to-head is your all-time record against this player from matches you
      // were on opposing teams, so show it for teammates too (just not yourself).
      // Players you have never faced fall back to an empty 0-0 record so the badge
      // is still present.
      headToHead: row.membership_id === account.membership_id
        ? null
        : h2h[row.membership_id] ?? {
            opponentMembershipId: row.membership_id,
            opponentMembershipType: row.membership_type,
            opponentDisplayName: row.display_name,
            encounters: 0,
            wins: 0,
            losses: 0,
            unknown: 0,
            lastPlayedAt: null,
            byMode: {},
            recentMeetings: [],
          },
    });
    const team = sortPlayers(rows.filter((row) => row.team_id === viewer.team_id).map(toPlayer));
    const opponents = sortPlayers(rows.filter((row) => row.team_id !== viewer.team_id).map(toPlayer));
    const opponentTeamId = opponents[0]
      ? rows.find((row) => row.membership_id === opponents[0].membershipId)?.team_id ?? null
      : null;
    const run = runByInstance.get(match.instance_id);
    const gameSession = gameSessionByInstance.get(match.instance_id);
    const linkedLobbyId = gameSession?.lobby_id ?? run?.lobby_id ?? null;
    const lobbyMode = linkedLobbyId ? lobbyModeById.get(linkedLobbyId) : undefined;
    const challengeTitle = run?.weekly_challenge_id ? challengeById.get(run.weekly_challenge_id) ?? null : null;
    const loadout = run ? loadoutByRun.get(run.id) ?? [] : [];
    const modeName = crucibleModeName({
      activityMode: match.activity_mode ?? null,
      activityModes: match.activity_modes ?? [],
      modeBucket: match.mode_bucket,
    });
    return {
      runId: run?.id ?? match.instance_id,
      instanceId: match.instance_id,
      mode: "crucible",
      modeBucket: match.mode_bucket,
      modeName,
      mapImage: match.activity_image ?? null,
      rerolledMode: lobbyMode === "draft" ? "draft" : lobbyMode === "roulette" ? "loadout_roulette" : null,
      playedAt: match.period,
      result: viewer.is_win === true ? "win" : viewer.is_win === false ? "loss" : "unknown",
      activityName: match.activity_name ?? modeName,
      challengeTitle,
      featuredPlayer: viewer ? toPlayer(viewer) : null,
      featuredPlayerLabel: viewer ? `${viewer.kills ?? 0} defeats / ${viewer.deaths ?? 0} deaths` : null,
      teamLabel: "Your Team",
      opponentLabel: "Enemy Team",
      teamScore: scoreForTeam(match.team_data, viewer.team_id),
      opponentScore: scoreForTeam(match.team_data, opponentTeamId),
      team,
      opponents,
      loadout: loadout.sort((a, b) => ["kinetic", "energy", "power"].indexOf(a.slot) - ["kinetic", "energy", "power"].indexOf(b.slot)),
    };
  }).filter((match): match is SeasonMatch => match !== null)
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

  return { matches, syncStatus };
}

export type SeasonStatsSyncStatus = "idle" | "queued" | "syncing" | "complete" | "failed";
