// Weekly leaderboard source (#249).
//
// Reads scored runs from weekly_leaderboard_entries (migration 029), scoped to a
// weekly challenge. One best entry per user is stored by the worker, so ranking
// by score is deterministic. All paths degrade to empty/absent so an unmigrated
// or empty DB renders clean empty states rather than crashing.

import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";
import type { LeaderboardEntry, UserPlacement } from "@/types/platform";
import { toPlatformLeaderboardEntry, type LeaderboardRow } from "@/lib/challenges/present";

const COMPLETED_WEEKLY_RUN_STATES = ["scored", "finalized"];

/** Full standings for a weekly challenge, ranked by score desc (#249). */
export async function getWeeklyStandings(
  weeklyChallengeId: string,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await withSupabaseTimeout(
      adminSupabase
        .from("weekly_leaderboard_entries")
        .select("user_id, score, rank, clear_time_seconds, deaths, created_at, users(display_name)")
        .eq("weekly_challenge_id", weeklyChallengeId)
        // Deterministic tie-breaking (#249): higher score, then faster clear, then
        // earlier submission - stable regardless of whether the worker has
        // backfilled the rank column yet.
        .order("score", { ascending: false })
        .order("clear_time_seconds", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(limit)
    );

    if (error || !data) return [];
    return (data as unknown as LeaderboardRow[]).map((row, i) =>
      toPlatformLeaderboardEntry(row, i + 1),
    );
  } catch {
    return [];
  }
}

/** Total runs started against a weekly challenge, for the hero's counter. */
export async function getWeeklyRunCount(weeklyChallengeId: string | null): Promise<number> {
  if (!weeklyChallengeId) return 0;
  try {
    const { count } = await withSupabaseTimeout(
      adminSupabase
        .from("challenge_runs")
        .select("id", { count: "exact", head: true })
        .eq("weekly_challenge_id", weeklyChallengeId)
        .in("status", COMPLETED_WEEKLY_RUN_STATES)
    );
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** The viewing user's best placement in a given weekly challenge (#249). */
export async function getUserWeeklyPlacement(
  userId: string,
  weeklyChallengeId: string | null,
): Promise<UserPlacement> {
  if (!weeklyChallengeId) return { rank: null, bestScore: null, totalRuns: 0 };
  try {
    const [{ data: entry }, { count }] = await Promise.all([
      withSupabaseTimeout(
        adminSupabase
          .from("weekly_leaderboard_entries")
          .select("rank, score")
          .eq("weekly_challenge_id", weeklyChallengeId)
          .eq("user_id", userId)
          .maybeSingle()
      ),
      withSupabaseTimeout(
        adminSupabase
          .from("challenge_runs")
          .select("id", { count: "exact", head: true })
          .eq("weekly_challenge_id", weeklyChallengeId)
          .eq("created_by", userId)
          .in("status", COMPLETED_WEEKLY_RUN_STATES)
      ),
    ]);

    if (!entry) return { rank: null, bestScore: null, totalRuns: count ?? 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = entry as any;
    return { rank: e.rank ?? null, bestScore: Number(e.score), totalRuns: count ?? 0 };
  } catch {
    return { rank: null, bestScore: null, totalRuns: 0 };
  }
}

/**
 * Standings preview for the home page: top 3, plus the current user's row when
 * they place outside the top 3 (#249).
 */
export async function getStandingsPreview(
  weeklyChallengeId: string,
  currentUserId?: string,
): Promise<LeaderboardEntry[]> {
  const top = await getWeeklyStandings(weeklyChallengeId, 3);
  for (const e of top) if (e.userId === currentUserId) e.isCurrentUser = true;

  if (!currentUserId || top.some((e) => e.userId === currentUserId)) return top;

  const placement = await getUserWeeklyPlacement(currentUserId, weeklyChallengeId);
  if (placement.rank && placement.rank > 3) {
    try {
      const { data } = await withSupabaseTimeout(
        adminSupabase
          .from("weekly_leaderboard_entries")
          .select("user_id, score, rank, clear_time_seconds, deaths, users(display_name)")
          .eq("weekly_challenge_id", weeklyChallengeId)
          .eq("user_id", currentUserId)
          .maybeSingle()
      );
      if (data) {
        top.push({
          ...toPlatformLeaderboardEntry(data as unknown as LeaderboardRow, placement.rank),
          isCurrentUser: true,
        });
      }
    } catch {
      // best effort - the top 3 still render
    }
  }
  return top;
}
