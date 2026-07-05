// Badge display data-access (#257).
//
// Reads a user's earned badges (player_badges joined to badges, migration 030)
// for the profile/season display. Awarding happens server-side in the worker via
// lib/badges/evaluators.ts; this is the read/display half only. Degrades to an
// empty list so an unmigrated or empty DB shows a clean "no badges yet" state.

import { adminSupabase } from "@/lib/supabase/admin";
import type { BadgeCategory, BadgeTier } from "@/types/badges";

export interface EarnedBadge {
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  earnedAt: string;
}

export async function getUserBadges(userId: string): Promise<EarnedBadge[]> {
  try {
    const { data, error } = await adminSupabase
      .from("player_badges")
      .select("earned_at, badges(slug, name, description, category, tier, is_active)")
      .eq("user_id", userId)
      .order("earned_at", { ascending: false });

    if (error || !data) return [];

    return (data as unknown as Array<{ earned_at: string; badges: {
      slug: string; name: string; description: string;
      category: BadgeCategory; tier: BadgeTier; is_active: boolean;
    } | null }>)
      .filter((row) => row.badges?.is_active)
      .map((row) => ({
        slug: row.badges!.slug,
        name: row.badges!.name,
        description: row.badges!.description,
        category: row.badges!.category,
        tier: row.badges!.tier,
        earnedAt: row.earned_at,
      }));
  } catch {
    return [];
  }
}
