// Player stats aggregation (#250/#258).
//
// Recomputes a player's season + lifetime aggregates from their runs and
// leaderboard entries and upserts them. Recompute (rather than increment) keeps
// it idempotent — reprocessing a run never double-counts. Called from
// compute_score once a run is scored, so the "Your Season" panel reflects real
// completed play.

import { adminSupabase } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const COMPLETED_STATES = ["scored", "finalized"];

async function countRuns(db: Db, userId: string, seasonId: string | null, filter?: (q: Db) => Db): Promise<number> {
  let q = db.from("challenge_runs").select("id", { count: "exact", head: true }).eq("created_by", userId);
  if (seasonId) q = q.eq("season_id", seasonId);
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

async function bestWeekly(db: Db, userId: string): Promise<{ score: number | null; rank: number | null }> {
  const { data } = await db
    .from("weekly_leaderboard_entries")
    .select("score, rank")
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = data as any;
  return { score: e?.score != null ? Number(e.score) : null, rank: e?.rank ?? null };
}

/** Recompute + upsert one player's season and lifetime aggregates. */
export async function syncPlayerStats(
  args: { userId: string; seasonId: string | null },
  db: Db = adminSupabase,
): Promise<void> {
  const { userId, seasonId } = args;
  const best = await bestWeekly(db, userId);

  if (seasonId) {
    const [totalRuns, completedRuns, weeklyClears] = await Promise.all([
      countRuns(db, userId, seasonId),
      countRuns(db, userId, seasonId, (q) => q.in("status", COMPLETED_STATES)),
      countRuns(db, userId, seasonId, (q) => q.eq("mode", "weekly_challenge").in("status", COMPLETED_STATES)),
    ]);
    await db.from("player_season_stats").upsert(
      {
        user_id: userId,
        season_id: seasonId,
        total_runs: totalRuns,
        completed_runs: completedRuns,
        weekly_clears: weeklyClears,
        best_weekly_score: best.score,
        best_weekly_rank: best.rank,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,season_id" },
    );
  }

  const [lifeTotal, lifeCompleted, lifeWeekly] = await Promise.all([
    countRuns(db, userId, null),
    countRuns(db, userId, null, (q) => q.in("status", COMPLETED_STATES)),
    countRuns(db, userId, null, (q) => q.eq("mode", "weekly_challenge").in("status", COMPLETED_STATES)),
  ]);
  await db.from("player_lifetime_stats").upsert(
    {
      user_id: userId,
      total_runs: lifeTotal,
      completed_runs: lifeCompleted,
      weekly_clears: lifeWeekly,
      best_weekly_score: best.score,
      best_weekly_rank: best.rank,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
