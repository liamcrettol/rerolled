// Weekly leaderboard source (#249).
//
// SKELETON: fixed mock standings so the home standings preview and the full
// leaderboard page can be built before scored runs are persisted. Signatures
// mirror the intended queries: standings scoped to a weekly challenge id, plus
// the viewing user's placement for the hero.

import type { LeaderboardEntry, UserPlacement } from "@/types/platform";

const MOCK_STANDINGS: LeaderboardEntry[] = [
  { rank: 1, userId: "u1", displayName: "Rivensbane", score: 9840, clearTimeSeconds: 892, deaths: 0, rolledWeaponKills: 214 },
  { rank: 2, userId: "u2", displayName: "ThornEnjoyer", score: 9120, clearTimeSeconds: 951, deaths: 1, rolledWeaponKills: 198 },
  { rank: 3, userId: "u3", displayName: "GuardianGwyn", score: 8730, clearTimeSeconds: 1004, deaths: 1, rolledWeaponKills: 187 },
  { rank: 4, userId: "u4", displayName: "SunbreakerSam", score: 8155, clearTimeSeconds: 1088, deaths: 2, rolledWeaponKills: 172 },
  { rank: 5, userId: "u5", displayName: "VoidwalkerVi", score: 7690, clearTimeSeconds: 1142, deaths: 2, rolledWeaponKills: 165 },
  { rank: 6, userId: "u6", displayName: "NightstalkerNox", score: 7210, clearTimeSeconds: 1203, deaths: 3, rolledWeaponKills: 151 },
  { rank: 7, userId: "u7", displayName: "TitanTom", score: 6880, clearTimeSeconds: 1266, deaths: 3, rolledWeaponKills: 143 },
  { rank: 8, userId: "u8", displayName: "WarlockWren", score: 6540, clearTimeSeconds: 1319, deaths: 4, rolledWeaponKills: 138 },
];

/** Full standings for a weekly challenge, ranked by score (#249). */
export async function getWeeklyStandings(
  _weeklyChallengeId: string,
  limit = MOCK_STANDINGS.length,
): Promise<LeaderboardEntry[]> {
  return MOCK_STANDINGS.slice(0, limit);
}

/**
 * The viewing user's placement in the active week. Mock returns a "runner"
 * outside the top 3 so the hero's "YOUR BEST: #37" state can be exercised.
 * Pass `hasRun = false` to preview the clean empty state.
 */
export async function getUserWeeklyPlacement(
  _userId: string,
  hasRun = true,
): Promise<UserPlacement> {
  if (!hasRun) return { rank: null, bestScore: null, totalRuns: 0 };
  return { rank: 37, bestScore: 5120, totalRuns: 2 };
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
  if (!currentUserId) return top;

  const placement = await getUserWeeklyPlacement(currentUserId);
  if (placement.rank && placement.rank > 3) {
    top.push({
      rank: placement.rank,
      userId: currentUserId,
      displayName: "You",
      score: placement.bestScore ?? 0,
      clearTimeSeconds: 1210,
      deaths: 3,
      rolledWeaponKills: 129,
      isCurrentUser: true,
    });
  }
  return top;
}
