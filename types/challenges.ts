import type { WeaponSlot } from "./bungie";

// Mirrors supabase/migrations/025_challenge_seasons_and_weekly_challenges.sql.

export type SeasonStatus = "draft" | "active" | "ended" | "archived";

export interface Season {
  id: string;
  season_key: string;
  display_name: string;
  starts_at: string;
  ends_at: string;
  status: SeasonStatus;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type WeeklyChallengeStatus = "draft" | "scheduled" | "active" | "expired" | "archived";
export type ActivityFamily = "gm" | "nightfall" | "dungeon" | "raid" | "vanguard" | "other";

// Machine-readable rule keys a weekly challenge can carry. Each maps to a
// display chip in the UI (see lib/challenges/rules.ts).
export type WeeklyChallengeRuleKey =
  | "required_weapon_type"
  | "banned_weapon_type"
  | "required_damage_type"
  | "banned_damage_type"
  | "allow_exotics"
  | "required_exotic_slot"
  | "reroll_limit"
  | "wildcard_slots"
  | "slot_locking"
  | "minimum_rolled_weapon_usage_pct"
  | "activity_completion_required"
  | "fresh_required"
  | "flawless_bonus_enabled";

export interface WeeklyChallengeRule<K extends WeeklyChallengeRuleKey = WeeklyChallengeRuleKey> {
  key: K;
  value: unknown;
  chip: string;
  display: string;
}

export interface ScoringConfig {
  base_points_per_kill: number;
  rolled_weapon_multiplier: number;
  precision_kill_bonus: number;
  death_penalty: number;
  flawless_bonus: number;
  completion_bonus: number;
  [key: string]: unknown;
}

// Stored as `rules` JSONB on weekly_challenges / weekly_challenge_versions.
export type WeeklyChallengeRuleSet = WeeklyChallengeRule[];

export interface WeeklyChallenge {
  id: string;
  season_id: string;
  week_number: number;
  title: string;
  slug: string;
  description: string | null;
  activity_hash: number | null;
  activity_name_snapshot: string | null;
  activity_mode: number | null;
  activity_family: ActivityFamily | null;
  starts_at: string;
  ends_at: string;
  published_at: string | null;
  status: WeeklyChallengeStatus;
  global_seed: string;
  rules: WeeklyChallengeRuleSet;
  scoring_config: ScoringConfig | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyChallengeVersion {
  id: string;
  weekly_challenge_id: string;
  version_number: number;
  title: string;
  activity_hash: number | null;
  activity_name_snapshot: string | null;
  rules: WeeklyChallengeRuleSet;
  scoring_config: ScoringConfig;
  snapshot_taken_at: string;
  created_at: string;
}

export type ChallengeRunMode = "score_attack" | "weekly_challenge";

// Mirrors lib/scoreAttack/types.ts's ScoreAttackRunState — keep in sync.
export type ChallengeRunStatus =
  | "created"
  | "loadout_rolled"
  | "applied"
  | "in_activity"
  | "completed_pending_pgcr"
  | "pgcr_fetched"
  | "parsed"
  | "scored"
  | "finalized"
  | "failed"
  | "abandoned"
  | "expired";

export type ComplianceStatus = "eligible" | "flagged" | "ineligible" | "unknown";

export interface ChallengeRun {
  id: string;
  mode: ChallengeRunMode;
  status: ChallengeRunStatus;
  weekly_challenge_id: string | null;
  weekly_challenge_version_id: string | null;
  season_id: string | null;
  lobby_id: string | null;
  round_id: string | null;
  activity_hash: number | null;
  pgcr_instance_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  finalized_at: string | null;
  score: number | null;
  scoring_breakdown: Record<string, unknown> | null;
  compliance_status: ComplianceStatus | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeRunParticipant {
  id: string;
  run_id: string;
  user_id: string;
  bungie_membership_id: string;
  bungie_membership_type: number | null;
  character_id: string | null;
  is_owner: boolean;
  joined_at: string;
}

export interface ChallengeRunLoadoutSlot {
  id: string;
  run_id: string;
  slot: WeaponSlot;
  item_hash: number;
  weapon_name: string;
  weapon_icon: string | null;
  weapon_type: string | null;
  damage_type: string | null;
  is_wildcard: boolean;
  reroll_count: number;
  created_at: string;
  updated_at: string;
}
