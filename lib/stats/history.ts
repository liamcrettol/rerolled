import type {
  SeasonMatch,
  SeasonMatchLoadoutSlot,
  SeasonMatchPlayer,
} from "@/types/platform";
import type {
  NormalizedPgcr,
  NormalizedPgcrPlayer,
  NormalizedPvpPgcr,
  NormalizedPvpPgcrPlayer,
} from "@/lib/scoreAttack/types";

const HISTORY_RUN_STATES = new Set(["parsed", "scored", "finalized"]);

export interface SeasonRunHistoryRow {
  id: string;
  mode: "score_attack" | "weekly_challenge";
  status: string;
  pgcr_instance_id: string | null;
  completed_at: string | null;
  created_at: string;
  weekly_challenge_id: string | null;
}

export interface SeasonRunParticipantRow {
  run_id: string;
  user_id: string;
  bungie_membership_id: string;
  bungie_membership_type: number | null;
}

export interface SeasonRunLoadoutRow {
  run_id: string;
  slot: "kinetic" | "energy" | "power";
  weapon_name: string;
  weapon_icon: string | null;
}

export interface SeasonWeeklyChallengeRow {
  id: string;
  title: string;
  activity_name_snapshot: string | null;
}

function groupBy<T, K>(rows: T[], keyFn: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

function sortPlayers(players: SeasonMatchPlayer[]): SeasonMatchPlayer[] {
  return [...players].sort((a, b) => {
    const killDiff = (b.kills ?? -1) - (a.kills ?? -1);
    if (killDiff !== 0) return killDiff;
    const deathDiff = (a.deaths ?? Number.MAX_SAFE_INTEGER) - (b.deaths ?? Number.MAX_SAFE_INTEGER);
    if (deathDiff !== 0) return deathDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}

function computeKd(kills: number | null, deaths: number | null): number | null {
  if (kills === null) return null;
  if (deaths === null) return null;
  if (deaths === 0) return kills;
  return Math.round((kills / deaths) * 100) / 100;
}

export function buildTrialsReportUrl(membershipType: number | null, membershipId: string): string | null {
  if (membershipType === null || !membershipId) return null;
  return `https://destinytrialsreport.com/report/${membershipType}/${membershipId}`;
}

function toSeasonPlayer(
  player: NormalizedPgcrPlayer,
  viewerMembershipIds: Set<string>,
  viewerTeamMembershipIds: Set<string>,
): SeasonMatchPlayer {
  return {
    membershipId: player.membershipId,
    membershipType: player.membershipType,
    displayName: player.displayName ?? "Guardian",
    emblemPath: player.emblemPath ?? null,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    kd: computeKd(player.kills, player.deaths),
    isCurrentUser: viewerMembershipIds.has(player.membershipId),
    isOnViewerTeam: viewerTeamMembershipIds.has(player.membershipId),
    trialsReportUrl: buildTrialsReportUrl(player.membershipType, player.membershipId),
  };
}

function resolveViewerTeamId(
  pgcr: NormalizedPvpPgcr,
  viewerMembershipIds: Set<string>,
): number | null {
  const counts = new Map<number, number>();
  for (const player of pgcr.players) {
    if (!viewerMembershipIds.has(player.membershipId) || player.team === null) continue;
    counts.set(player.team, (counts.get(player.team) ?? 0) + 1);
  }

  let bestTeam: number | null = null;
  let bestCount = -1;
  for (const [teamId, count] of counts.entries()) {
    if (count > bestCount) {
      bestTeam = teamId;
      bestCount = count;
    }
  }
  return bestTeam;
}

function buildPvpMatch(
  run: SeasonRunHistoryRow,
  pgcr: NormalizedPvpPgcr,
  viewerMembershipIds: Set<string>,
  challenge: SeasonWeeklyChallengeRow | null,
  loadout: SeasonMatchLoadoutSlot[],
): SeasonMatch | null {
  const viewerTeamId = resolveViewerTeamId(pgcr, viewerMembershipIds);
  const viewerTeamMembershipIds = new Set(
    pgcr.players
      .filter((player) => viewerTeamId !== null && player.team === viewerTeamId)
      .map((player) => player.membershipId),
  );

  if (viewerTeamMembershipIds.size === 0) {
    for (const id of viewerMembershipIds) viewerTeamMembershipIds.add(id);
  }

  const team = sortPlayers(
    pgcr.players
      .filter((player) => viewerTeamMembershipIds.has(player.membershipId))
      .map((player) => toSeasonPlayer(player, viewerMembershipIds, viewerTeamMembershipIds)),
  );
  const opponents = sortPlayers(
    pgcr.players
      .filter((player) => !viewerTeamMembershipIds.has(player.membershipId))
      .map((player) => toSeasonPlayer(player, viewerMembershipIds, viewerTeamMembershipIds)),
  );

  if (team.length === 0 && opponents.length === 0) return null;

  const featuredPlayer = sortPlayers([...team, ...opponents])[0] ?? null;
  const viewerResult = pgcr.players.find(
    (player) => viewerTeamMembershipIds.has(player.membershipId) && player.isWin !== null,
  )?.isWin ?? null;

  const opponentTeamId =
    viewerTeamId === null
      ? null
      : pgcr.teams.find((teamRow) => teamRow.teamId !== null && teamRow.teamId !== viewerTeamId)?.teamId ?? null;

  return {
    runId: run.id,
    instanceId: pgcr.instanceId,
    mode: run.mode,
    playedAt: run.completed_at ?? run.created_at,
    result: viewerResult === true ? "win" : viewerResult === false ? "loss" : "unknown",
    activityName: challenge?.activity_name_snapshot ?? challenge?.title ?? "PvP Match",
    challengeTitle: challenge?.title ?? null,
    featuredPlayer,
    featuredPlayerLabel: featuredPlayer
      ? `${featuredPlayer.displayName} · ${featuredPlayer.kills ?? 0}K / ${featuredPlayer.deaths ?? 0}D`
      : null,
    teamLabel: "Your Team",
    opponentLabel: opponents.length > 0 ? "Enemy Team" : null,
    teamScore: viewerTeamId === null
      ? null
      : pgcr.teams.find((teamRow) => teamRow.teamId === viewerTeamId)?.score ?? null,
    opponentScore: opponentTeamId === null
      ? null
      : pgcr.teams.find((teamRow) => teamRow.teamId === opponentTeamId)?.score ?? null,
    team,
    opponents,
    loadout,
  };
}

function buildNonPvpMatch(
  run: SeasonRunHistoryRow,
  pgcr: NormalizedPgcr,
  viewerMembershipIds: Set<string>,
  challenge: SeasonWeeklyChallengeRow | null,
  loadout: SeasonMatchLoadoutSlot[],
): SeasonMatch | null {
  const teamMembershipIds = new Set<string>();
  for (const id of viewerMembershipIds) teamMembershipIds.add(id);

  const team = sortPlayers(
    pgcr.players
      .filter((player) => teamMembershipIds.has(player.membershipId))
      .map((player) => toSeasonPlayer(player, viewerMembershipIds, teamMembershipIds)),
  );
  const opponents = sortPlayers(
    pgcr.players
      .filter((player) => !teamMembershipIds.has(player.membershipId))
      .map((player) => toSeasonPlayer(player, viewerMembershipIds, teamMembershipIds)),
  );

  if (team.length === 0 && opponents.length === 0) return null;

  const featuredPlayer = sortPlayers([...team, ...opponents])[0] ?? null;

  return {
    runId: run.id,
    instanceId: pgcr.instanceId,
    mode: run.mode,
    playedAt: run.completed_at ?? run.created_at,
    result: "unknown",
    activityName: challenge?.activity_name_snapshot ?? challenge?.title ?? "Activity",
    challengeTitle: challenge?.title ?? null,
    featuredPlayer,
    featuredPlayerLabel: featuredPlayer
      ? `${featuredPlayer.displayName} · ${featuredPlayer.kills ?? 0}K / ${featuredPlayer.deaths ?? 0}D`
      : null,
    teamLabel: "Your Team",
    opponentLabel: opponents.length > 0 ? "Other Players" : null,
    teamScore: null,
    opponentScore: null,
    team,
    opponents,
    loadout,
  };
}

export function buildSeasonMatchHistory(params: {
  runs: SeasonRunHistoryRow[];
  participants: SeasonRunParticipantRow[];
  loadoutRows: SeasonRunLoadoutRow[];
  weeklyChallenges: SeasonWeeklyChallengeRow[];
  pgcrByInstanceId: Map<string, NormalizedPgcr>;
  viewerUserId: string;
}): SeasonMatch[] {
  const { runs, participants, loadoutRows, weeklyChallenges, pgcrByInstanceId, viewerUserId } = params;
  const participantsByRun = groupBy(participants, (row) => row.run_id);
  const loadoutByRun = groupBy(loadoutRows, (row) => row.run_id);
  const weeklyById = new Map(weeklyChallenges.map((row) => [row.id, row] as const));

  return runs
    .filter((run) => HISTORY_RUN_STATES.has(run.status) && run.pgcr_instance_id)
    .map((run) => {
      const pgcr = run.pgcr_instance_id ? pgcrByInstanceId.get(run.pgcr_instance_id) ?? null : null;
      if (!pgcr?.isSupported) return null;

      const runParticipants = participantsByRun.get(run.id) ?? [];
      const viewerMembershipIds = new Set(
        runParticipants
          .filter((row) => row.user_id === viewerUserId)
          .map((row) => row.bungie_membership_id),
      );
      if (viewerMembershipIds.size === 0) return null;

      const loadout = (loadoutByRun.get(run.id) ?? [])
        .sort((a, b) => ["kinetic", "energy", "power"].indexOf(a.slot) - ["kinetic", "energy", "power"].indexOf(b.slot))
        .map((row) => ({
          slot: row.slot,
          name: row.weapon_name,
          icon: row.weapon_icon,
        }));

      const challenge = run.weekly_challenge_id
        ? weeklyById.get(run.weekly_challenge_id) ?? null
        : null;

      return pgcr.kind === "pvp"
        ? buildPvpMatch(run, pgcr, viewerMembershipIds, challenge, loadout)
        : buildNonPvpMatch(run, pgcr, viewerMembershipIds, challenge, loadout);
    })
    .filter((match): match is SeasonMatch => match !== null)
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
}
