// Mirrors supabase/migrations/030_badges_and_stats.sql.

export type BadgeCategory =
  | "completion"
  | "performance"
  | "compliance"
  | "difficulty"
  | "streak"
  | "founder";

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum" | "special";

// Which Badge Case tab a badge shows under (see project design notes). Distinct
// from `category`, which describes the badge's nature (completion/streak/etc.)
// rather than its mode grouping. Null = mode-agnostic (e.g. Core badges).
export type BadgeMode =
  | "core"
  | "crucible"
  | "trials"
  | "iron_banner"
  | "pve"
  | "status_legacy";

export interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  mode: BadgeMode | null;
  icon_key: string | null;
  is_active: boolean;
  is_hidden: boolean;
  is_repeatable: boolean;
  sort_order: number;
  criteria: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlayerBadge {
  id: string;
  user_id: string;
  bungie_membership_id: string | null;
  badge_id: string;
  earned_at: string;
  source_run_id: string | null;
  source_weekly_challenge_id: string | null;
  season_id: string | null;
  metadata: Record<string, unknown>;
  // 'once' for non-repeatable badges, otherwise a season/week scope key —
  // see lib/badges/evaluators.ts for how this gets set.
  scope_key: string;
}

export interface PlayerSeasonStats {
  id: string;
  user_id: string;
  season_id: string;
  total_runs: number;
  completed_runs: number;
  weekly_clears: number;
  best_weekly_rank: number | null;
  best_weekly_score: number | null;
  best_score_attack_score: number | null;
  total_rolled_weapon_kills: number;
  total_weapon_kills: number;
  rolled_weapon_usage_pct: number | null;
  total_deaths: number;
  flawless_clears: number;
  no_reroll_clears: number;
  eligible_leaderboard_runs: number;
  flagged_ineligible_runs: number;
  current_streak: number;
  longest_streak: number;
  updated_at: string;
}

export interface PlayerWeeklyStats {
  id: string;
  user_id: string;
  weekly_challenge_id: string;
  season_id: string | null;
  runs: number;
  best_score: number | null;
  best_rank: number | null;
  clears: number;
  deaths: number;
  rolled_weapon_usage_pct: number | null;
  compliance_status: "eligible" | "flagged" | "ineligible" | "unknown" | null;
  updated_at: string;
}

export interface PlayerLifetimeStats {
  id: string;
  user_id: string;
  total_runs: number;
  completed_runs: number;
  weekly_clears: number;
  best_weekly_rank: number | null;
  best_weekly_score: number | null;
  best_score_attack_score: number | null;
  total_rolled_weapon_kills: number;
  total_weapon_kills: number;
  rolled_weapon_usage_pct: number | null;
  total_deaths: number;
  flawless_clears: number;
  no_reroll_clears: number;
  eligible_leaderboard_runs: number;
  flagged_ineligible_runs: number;
  current_streak: number;
  longest_streak: number;
  favorite_weapon_hash: number | null;
  updated_at: string;
}

// Union used by helpers that operate on "a player stats row" regardless of scope.
export type PlayerStats = PlayerSeasonStats | PlayerWeeklyStats | PlayerLifetimeStats;

export interface WeeklyLeaderboardEntry {
  id: string;
  weekly_challenge_id: string;
  season_id: string | null;
  run_id: string;
  user_id: string;
  bungie_membership_id: string;
  score: number;
  rank: number | null;
  clear_time_seconds: number | null;
  deaths: number | null;
  rolled_weapon_usage_pct: number | null;
  compliance_status: "eligible" | "flagged" | "ineligible" | "unknown" | null;
  created_at: string;
  updated_at: string;
}
