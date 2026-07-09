// Presenters: map challenge-platform DB rows (types/challenges.ts, mirroring
// migrations 025–031) into the flat shapes the platform UI renders
// (types/platform.ts). Pure and unit-tested so the read path is verifiable
// without a live database (#245/#249/#250).

import type {
  LeaderboardEntry,
  SeasonStats,
  WeeklyChallenge as PlatformWeeklyChallenge,
  WeeklyRule,
} from "@/types/platform";
import type {
  WeeklyChallenge,
  WeeklyChallengeRuleSet,
  WeeklyChallengeRuleKey,
} from "@/types/challenges";

function toneForRule(key: WeeklyChallengeRuleKey, value: unknown): WeeklyRule["tone"] {
  if (key.startsWith("required_")) return "require";
  if (key.startsWith("banned_")) return "ban";
  if (key === "allow_exotics") return value === false ? "ban" : "neutral";
  return "neutral";
}

/** Weekly ruleset → display chips for the hero. */
export function rulesToChips(rules: WeeklyChallengeRuleSet | null | undefined): WeeklyRule[] {
  return (rules ?? []).map((r) => ({
    label: r.chip || r.display || r.key,
    tone: toneForRule(r.key, r.value),
  }));
}

/** Pull the reroll allowance out of the ruleset (0 if unset). */
export function rerollCountFromRules(rules: WeeklyChallengeRuleSet | null | undefined): number {
  const rule = (rules ?? []).find((r) => r.key === "reroll_limit");
  return typeof rule?.value === "number" ? rule.value : 0;
}

/** weekly_challenges row (+ joined season_key) → platform WeeklyChallenge. */
export function toPlatformChallenge(
  row: WeeklyChallenge,
  seasonKey: string,
): PlatformWeeklyChallenge {
  return {
    id: row.id,
    weekNumber: row.week_number,
    seasonKey,
    title: row.title,
    slug: row.slug,
    activityName: row.activity_name_snapshot ?? "Activity TBD",
    activityFamily: row.activity_family ?? "other",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rules: rulesToChips(row.rules),
    rerollCount: rerollCountFromRules(row.rules),
    globalSeed: row.global_seed,
    status: row.status,
  };
}

// Shape of a weekly_leaderboard_entries row with the user display_name joined.
export interface LeaderboardRow {
  user_id: string;
  score: number | string;
  rank: number | null;
  clear_time_seconds: number | null;
  deaths: number | null;
  users?: { display_name: string | null } | null;
}

/** weekly_leaderboard_entries row → platform LeaderboardEntry. */
export function toPlatformLeaderboardEntry(row: LeaderboardRow, fallbackRank: number): LeaderboardEntry {
  return {
    rank: row.rank ?? fallbackRank,
    userId: row.user_id,
    displayName: row.users?.display_name ?? "Guardian",
    score: Number(row.score),
    clearTimeSeconds: row.clear_time_seconds ?? 0,
    deaths: row.deaths ?? 0,
    // Per-weapon kills aren't stored on leaderboard entries (only usage %); not
    // shown in the standings rows, so 0 is a safe placeholder here.
    rolledWeaponKills: 0,
  };
}

// Minimal shapes for the season presenter.
export interface SeasonRow {
  season_key: string;
  display_name: string;
}
export interface PlayerSeasonStatsRow {
  total_runs: number;
  total_weapon_kills: number;
  weekly_clears: number;
  best_weekly_rank: number | null;
}

export function emptySeasonStats(season: SeasonRow): SeasonStats {
  return {
    seasonKey: season.season_key,
    seasonName: season.display_name,
    totalRuns: 0,
    rouletteKills: 0,
    weeklyChallengesCleared: 0,
    bestWeeklyPlacement: null,
    bestWeapon: null,
    matchHistory: [],
    historySyncStatus: "idle",
  };
}

/** player_season_stats row (+ resolved favorite weapon) → platform SeasonStats. */
export function toPlatformSeasonStats(
  row: PlayerSeasonStatsRow | null,
  season: SeasonRow,
  bestWeapon: SeasonStats["bestWeapon"],
): SeasonStats {
  if (!row) return emptySeasonStats(season);
  return {
    seasonKey: season.season_key,
    seasonName: season.display_name,
    totalRuns: row.total_runs,
    rouletteKills: row.total_weapon_kills,
    weeklyChallengesCleared: row.weekly_clears,
    bestWeeklyPlacement: row.best_weekly_rank ?? null,
    bestWeapon,
    matchHistory: [],
    historySyncStatus: "idle",
  };
}
