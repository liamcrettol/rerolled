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
