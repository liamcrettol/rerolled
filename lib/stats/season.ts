// "Your Season" stats source (#250).
//
// Reads the viewing user's aggregated season stats from player_season_stats
// (migration 030) for the active season, resolving their favorite weapon hash to
// a readable name. New/empty users get a clean zeroed summary. All failures
// degrade to the empty state so the panel never breaks.

import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";
import { getWeaponDefinitions } from "@/lib/bungie/definitions";
import type { SeasonStats } from "@/types/platform";
import {
  toPlatformSeasonStats,
  emptySeasonStats,
  type SeasonRow,
  type PlayerSeasonStatsRow,
} from "@/lib/challenges/present";
import {
  buildSeasonMatchHistory,
  type SeasonRunHistoryRow,
  type SeasonRunLoadoutRow,
  type SeasonRunParticipantRow,
  type SeasonWeeklyChallengeRow,
} from "@/lib/stats/history";
import type { NormalizedPgcr } from "@/lib/scoreAttack/types";
import { getCrucibleMatchHistory } from "@/lib/crucible/matchHistory";

const FALLBACK_SEASON: SeasonRow = { season_key: "", display_name: "Season" };

async function resolveFavoriteWeapon(userId: string): Promise<SeasonStats["bestWeapon"]> {
  try {
    const { data } = await withSupabaseTimeout(
      adminSupabase
        .from("player_lifetime_stats")
        .select("favorite_weapon_hash, total_rolled_weapon_kills")
        .eq("user_id", userId)
        .maybeSingle()
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    if (!row?.favorite_weapon_hash) return null;
    const defs = await getWeaponDefinitions([Number(row.favorite_weapon_hash)]);
    const def = defs.get(Number(row.favorite_weapon_hash));
    if (!def) return null;
    return { name: def.name, kills: row.total_rolled_weapon_kills ?? 0 };
  } catch {
    return null;
  }
}

export async function getSeasonStats(userId: string): Promise<SeasonStats> {
  try {
    const careerHistoryPromise = getCrucibleMatchHistory(userId).catch(() => ({
      matches: [],
      syncStatus: "idle" as const,
    }));
    const { data: season } = await withSupabaseTimeout(
      adminSupabase
        .from("seasons")
        .select("id, season_key, display_name")
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = season as any;
    if (!s) {
      const career = await careerHistoryPromise;
      return { ...emptySeasonStats(FALLBACK_SEASON), matchHistory: career.matches, historySyncStatus: career.syncStatus };
    }

    const [{ data: statsRow }, bestWeapon, { data: participantRows }] = await Promise.all([
      withSupabaseTimeout(
        adminSupabase
          .from("player_season_stats")
          .select("total_runs, total_weapon_kills, weekly_clears, best_weekly_rank")
          .eq("user_id", userId)
          .eq("season_id", s.id)
          .maybeSingle()
      ),
      resolveFavoriteWeapon(userId),
      withSupabaseTimeout(
        adminSupabase
          .from("challenge_run_participants")
          .select("run_id, user_id, bungie_membership_id, bungie_membership_type")
          .eq("user_id", userId)
      ),
    ]);

    const baseStats = toPlatformSeasonStats(
      (statsRow as PlayerSeasonStatsRow | null) ?? null,
      { season_key: s.season_key, display_name: s.display_name },
      bestWeapon,
    );
    const career = await careerHistoryPromise;

    const runIds = [...new Set((participantRows ?? []).map((row) => row.run_id))];
    if (runIds.length === 0) {
      return { ...baseStats, matchHistory: career.matches, historySyncStatus: career.syncStatus };
    }

    const [{ data: runs }, { data: allParticipants }, { data: loadoutRows }] = await Promise.all([
      withSupabaseTimeout(
        adminSupabase
          .from("challenge_runs")
          .select("id, mode, status, pgcr_instance_id, completed_at, created_at, weekly_challenge_id")
          .eq("season_id", s.id)
          .in("id", runIds)
          .order("completed_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
      ),
      withSupabaseTimeout(
        adminSupabase
          .from("challenge_run_participants")
          .select("run_id, user_id, bungie_membership_id, bungie_membership_type")
          .in("run_id", runIds)
      ),
      withSupabaseTimeout(
        adminSupabase
          .from("challenge_run_loadout_slots")
          .select("run_id, slot, weapon_name, weapon_icon")
          .in("run_id", runIds)
      ),
    ]);

    const weeklyChallengeIds = [...new Set((runs ?? []).flatMap((run) => run.weekly_challenge_id ? [run.weekly_challenge_id] : []))];
    const pgcrInstanceIds = [...new Set((runs ?? []).flatMap((run) => run.pgcr_instance_id ? [run.pgcr_instance_id] : []))];

    const [{ data: weeklyChallenges }, { data: pgcrRows }] = await Promise.all([
      weeklyChallengeIds.length > 0
        ? withSupabaseTimeout(
            adminSupabase
              .from("weekly_challenges")
              .select("id, title, activity_name_snapshot")
              .in("id", weeklyChallengeIds)
          )
        : Promise.resolve({ data: [] }),
      pgcrInstanceIds.length > 0
        ? withSupabaseTimeout(
            adminSupabase
              .from("pgcr_cache")
              .select("instance_id, normalized_pgcr")
              .in("instance_id", pgcrInstanceIds)
          )
        : Promise.resolve({ data: [] }),
    ]);

    const pgcrByInstanceId = new Map<string, NormalizedPgcr>();
    for (const row of pgcrRows ?? []) {
      if (row.instance_id && row.normalized_pgcr) {
        pgcrByInstanceId.set(row.instance_id, row.normalized_pgcr as unknown as NormalizedPgcr);
      }
    }

    const legacyHistory = buildSeasonMatchHistory({
      runs: (runs ?? []) as SeasonRunHistoryRow[],
      participants: (allParticipants ?? []) as SeasonRunParticipantRow[],
      loadoutRows: (loadoutRows ?? []) as SeasonRunLoadoutRow[],
      weeklyChallenges: (weeklyChallenges ?? []) as SeasonWeeklyChallengeRow[],
      pgcrByInstanceId,
      viewerUserId: userId,
    });
    const importedIds = new Set(career.matches.map((match) => match.instanceId).filter(Boolean));
    const mergedHistory = [
      ...career.matches,
      ...legacyHistory.filter((match) => !match.instanceId || !importedIds.has(match.instanceId)),
    ].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime()).slice(0, 12);

    return {
      ...baseStats,
      matchHistory: mergedHistory,
      historySyncStatus: career.syncStatus,
    };
  } catch {
    return emptySeasonStats(FALLBACK_SEASON);
  }
}
