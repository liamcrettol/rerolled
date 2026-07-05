// Score Attack standings (#248 follow-up).
//
// Score Attack has no dedicated leaderboard table — runs live in
// challenge_runs with their score and compliance verdict. Standings are the
// best scored run per player, ranked by score. Flagged/ineligible runs are
// excluded; unknown/unevaluated compliance is included (the verdict can lag
// the score by a worker cycle). All paths degrade to empty so an unmigrated
// or empty DB renders a clean empty state.

import { adminSupabase } from "@/lib/supabase/admin";
import type { LeaderboardEntry } from "@/types/platform";

interface RunRow {
  created_by: string;
  score: number | string;
  scoring_breakdown: {
    durationSeconds?: number | null;
    deaths?: number | null;
    rolledWeaponKills?: number;
  } | null;
  users?: { display_name: string | null } | null;
}

/** Best scored Score Attack run per player, ranked by score desc. */
export async function getScoreAttackStandings(
  limit = 10,
  currentUserId?: string,
): Promise<LeaderboardEntry[]> {
  try {
    // Pull a generous window of top runs, then keep each player's best. A
    // player with many good runs can push others out of the window, but 20×
    // the display size is plenty until the mode has real volume.
    const { data, error } = await adminSupabase
      .from("challenge_runs")
      .select("created_by, score, scoring_breakdown, users(display_name)")
      .eq("mode", "score_attack")
      .in("status", ["scored", "finalized"])
      .not("score", "is", null)
      .or("compliance_status.is.null,compliance_status.in.(eligible,unknown)")
      .order("score", { ascending: false })
      .limit(limit * 20);

    if (error || !data) return [];

    const bestPerUser = new Map<string, RunRow>();
    for (const row of data as unknown as RunRow[]) {
      if (!bestPerUser.has(row.created_by)) bestPerUser.set(row.created_by, row);
    }

    return [...bestPerUser.values()].slice(0, limit).map((row, i) => ({
      rank: i + 1,
      userId: row.created_by,
      displayName: row.users?.display_name ?? "Guardian",
      score: Number(row.score),
      clearTimeSeconds: row.scoring_breakdown?.durationSeconds ?? 0,
      deaths: row.scoring_breakdown?.deaths ?? 0,
      rolledWeaponKills: row.scoring_breakdown?.rolledWeaponKills ?? 0,
      isCurrentUser: currentUserId ? row.created_by === currentUserId : undefined,
    }));
  } catch {
    return [];
  }
}
