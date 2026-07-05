// Platform types for the fireteam game-night redesign (#237).
//
// These describe the *shape* of the new challenge-platform data so the UI shell
// (#243) can be built against stable interfaces before the backend exists. The
// mock sources in lib/weekly and lib/stats return these types today; a real
// Supabase-backed implementation can drop in later without touching the UI.

/** Every play mode the platform knows about (#244). */
export type ModeId =
  | "gun_roulette"
  | "score_attack"
  | "weekly_challenge"
  | "draft"
  | "ironman";

/** Status badge shown on a mode card. */
export type ModeStatus = "live" | "new" | "soon";

/**
 * A mode's display + launch metadata (#244). Cards on the home grid are driven
 * entirely by these records so the homepage never accumulates one-off card
 * conditionals.
 */
export interface ModeDefinition {
  id: ModeId;
  title: string;
  /** One-sentence pitch shown under the title. */
  description: string;
  status: ModeStatus;
  enabled: boolean;
  /**
   * Where selecting the card takes the user. `null` for disabled roadmap modes
   * (#253) that must not start a flow.
   */
  href: string | null;
}

/** A single rule chip rendered on the weekly hero (#245). */
export interface WeeklyRule {
  /** Short uppercase label, e.g. "SIDEARM REQUIRED". */
  label: string;
  /** Optional tone for restriction vs. requirement styling. */
  tone?: "require" | "ban" | "neutral";
}

/** The featured global weekly challenge (#245/#256). */
export interface WeeklyChallenge {
  id: string;
  weekNumber: number;
  seasonKey: string;
  title: string;
  slug: string;
  /** Human activity name, e.g. "GM: Lightblade". */
  activityName: string;
  activityFamily: "gm" | "nightfall" | "dungeon" | "raid" | "vanguard" | "other";
  /** ISO timestamps defining the competition window (#251). */
  startsAt: string;
  endsAt: string;
  /** Display rule chips. */
  rules: WeeklyRule[];
  rerollCount: number;
  /** Stable per-week seed so everyone gets the same roll space. */
  globalSeed: string;
  status: "draft" | "scheduled" | "active" | "expired" | "archived";
}

/** One row on a weekly leaderboard (#249). */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  clearTimeSeconds: number;
  deaths: number;
  rolledWeaponKills: number;
  /** True when this row belongs to the viewing user (for highlighting). */
  isCurrentUser?: boolean;
}

/** The viewing user's placement in the active week (#249). */
export interface UserPlacement {
  /** Null when the user has not run the weekly yet. */
  rank: number | null;
  bestScore: number | null;
  totalRuns: number;
}

/** The persistent "Your Season" summary panel data (#250). */
export interface SeasonStats {
  seasonKey: string;
  seasonName: string;
  totalRuns: number;
  rouletteKills: number;
  weeklyChallengesCleared: number;
  bestWeeklyPlacement: number | null;
  bestWeapon: { name: string; kills: number } | null;
}
