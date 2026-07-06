// v1 badge slugs — must match supabase/migrations/031_challenge_platform_seed.sql.
export const BADGE_SLUGS = {
  WEEKLY_CLEAR: "weekly_clear",
  PURE_ROLL: "pure_roll",
  NO_REROLLS: "no_rerolls",
  TOP_10_PERCENT_WEEKLY: "top_10_percent_weekly",
  THREE_WEEK_STREAK: "three_week_streak",
} as const;

export type BadgeSlug = (typeof BADGE_SLUGS)[keyof typeof BADGE_SLUGS];

export const ALL_BADGE_SLUGS: BadgeSlug[] = Object.values(BADGE_SLUGS);

// Rerolled badge slugs (Core/Crucible/Trials/Iron Banner/PvE/Status) — must
// match supabase/migrations/037_rerolled_badge_seed.sql. Evaluated by the
// generic rule dispatcher in lib/badges/rerolledEvaluators.ts rather than one
// named evaluator per slug (see that file for why).
export const REROLLED_BADGE_SLUGS = {
  // Core
  DRAWN: "core_drawn",
  BOUND: "core_bound",
  NO_DEVIATION: "core_no_deviation",
  THREEFOLD: "core_threefold",
  FULL_ACCORD: "core_full_accord",
  CHAIN: "core_chain",
  UNBROKEN_CHAIN: "core_unbroken_chain",
  VERIFIED: "core_verified",
  SANCTIONED: "core_sanctioned",
  FORFEIT: "core_forfeit",
  // Crucible
  CRUCIBLE_WRIT: "crucible_writ",
  OVERMATCH: "crucible_overmatch",
  HIGH_MARK: "crucible_high_mark",
  REDLINE: "crucible_redline",
  APEX: "crucible_apex",
  HELD_GROUND: "crucible_held_ground",
  LOCKOUT: "crucible_lockout",
  SOLITARY: "crucible_solitary",
  LAST_NAME: "crucible_last_name",
  COLUMN_VII: "crucible_column_vii",
  OUT_OF_MEDALS: "crucible_out_of_medals",
  GHOST_SIGNAL: "crucible_ghost_signal",
  UNTOUCHED: "crucible_untouched",
  // Trials
  PASSAGE: "trials_passage",
  PASSAGE_III: "trials_passage_iii",
  PASSAGE_VII: "trials_passage_vii",
  LIGHTHOUSE_WRIT: "trials_lighthouse_writ",
  PROVEN: "trials_proven",
  VERDICT: "trials_verdict",
  LAST_RITE: "trials_last_rite",
  CARDBOUND: "trials_cardbound",
  // Iron Banner
  IRONBOUND: "iron_banner_ironbound",
  STANDARD: "iron_banner_standard",
  BANNER_WRIT: "iron_banner_banner_writ",
  FORGED: "iron_banner_forged",
  RITE_OF_IRON: "iron_banner_rite_of_iron",
  // PvE
  VANGUARD_WRIT: "pve_vanguard_writ",
  ORDEAL: "pve_ordeal",
  GRAND_ORDEAL: "pve_grand_ordeal",
  FIRETEAM_ACCORD: "pve_fireteam_accord",
  ENCOUNTER_WRIT: "pve_encounter_writ",
  DEEP_WRIT: "pve_deep_writ",
  RAID_WRIT: "pve_raid_writ",
  NO_RESERVE: "pve_no_reserve",
  // Status / Legacy (manually granted, not evaluated from run data)
  FOUNDER: "status_founder",
  DEVELOPER: "status_developer",
  ADVISOR: "status_advisor",
  INVICT: "status_invict",
} as const;

export type RerolledBadgeSlug = (typeof REROLLED_BADGE_SLUGS)[keyof typeof REROLLED_BADGE_SLUGS];

export const ALL_REROLLED_BADGE_SLUGS: RerolledBadgeSlug[] = Object.values(REROLLED_BADGE_SLUGS);

// Rule keys not yet backed by an evaluator implementation — the underlying
// PGCR data (round-by-round final blows, an "Iron Banner session" boundary)
// doesn't exist in the pipeline yet. Seeded in the catalog as locked/upcoming
// so the Badge Case can show them, but rerolledEvaluators.ts throws if one of
// these is dispatched. See that file's NOT_YET_IMPLEMENTED_RULES comment.
export const NOT_YET_IMPLEMENTED_REROLLED_SLUGS: RerolledBadgeSlug[] = [
  REROLLED_BADGE_SLUGS.PROVEN,
  REROLLED_BADGE_SLUGS.VERDICT,
  REROLLED_BADGE_SLUGS.LAST_RITE,
  REROLLED_BADGE_SLUGS.RITE_OF_IRON,
];
