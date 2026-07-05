// "Your Season" stats source (#250).
//
// SKELETON: mock per-user season summary so the home panel and /stats page can
// be built before the season/profile aggregation layer (#258) exists. The real
// version aggregates across completed runs without double-counting re-applies.

import type { SeasonStats } from "@/types/platform";

const MOCK_SEASON: SeasonStats = {
  seasonKey: "2026-summer",
  seasonName: "Summer 2026",
  totalRuns: 18,
  rouletteKills: 1342,
  weeklyChallengesCleared: 3,
  bestWeeklyPlacement: 37,
  bestWeapon: { name: "The Immortal", kills: 214 },
};

const EMPTY_SEASON: SeasonStats = {
  seasonKey: "2026-summer",
  seasonName: "Summer 2026",
  totalRuns: 0,
  rouletteKills: 0,
  weeklyChallengesCleared: 0,
  bestWeeklyPlacement: null,
  bestWeapon: null,
};

/**
 * Season stats for a user. Pass `isNewUser = true` to preview the clean
 * empty state (#250 acceptance: new-user state is not broken).
 */
export async function getSeasonStats(
  _userId: string,
  isNewUser = false,
): Promise<SeasonStats> {
  return isNewUser ? EMPTY_SEASON : MOCK_SEASON;
}
