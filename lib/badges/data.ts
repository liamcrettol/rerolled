// Badge display data-access (#257, extended #297).
//
// Reads badge data (migration 030 + mode column from 036) for display.
// Awarding happens server-side in the worker via lib/badges/evaluators.ts /
// rerolledEvaluators.ts; this is the read/display half only, plus manual
// grants (lib/badges/grant.ts) for status/legacy badges. Degrades to an
// empty list so an unmigrated or empty DB shows a clean "no badges yet"
// state rather than throwing.

import { adminSupabase } from "@/lib/supabase/admin";
import type { Badge, BadgeCategory, BadgeMode, BadgeTier } from "@/types/badges";

export interface DisplayBadge {
  slug: string;
  status: "earned" | "hidden";
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  mode: BadgeMode | null;
  iconKey: string | null;
  earnedAt: string;
  sortOrder: number;
  evidence: {
    sourceRunId: string | null;
    sourceWeeklyChallengeId: string | null;
    seasonId: string | null;
  };
}

// A catalog entry the caller is allowed to see, earned or not. Unearned
// hidden badges are never included (see getBadgeCatalog) — this is the type
// for "locked" tiles in the Badge Case, so earnedAt is nullable here unlike
// DisplayBadge.
export interface CatalogBadge {
  slug: string;
  earned: boolean;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  mode: BadgeMode | null;
  iconKey: string | null;
  sortOrder: number;
  earnedAt: string | null;
}

type BadgeRow = Pick<
  Badge,
  "slug" | "name" | "description" | "category" | "tier" | "mode" | "icon_key" | "is_active" | "is_hidden" | "sort_order"
>;

type PlayerBadgeRow = {
  earned_at: string;
  source_run_id: string | null;
  source_weekly_challenge_id: string | null;
  season_id: string | null;
  badges: BadgeRow | null;
};

/** A user's own earned badges, newest first. Includes their own hidden
 * badges (e.g. core_forfeit) — is_hidden only controls whether OTHER users
 * can discover the badge exists, not whether you can see your own. */
export async function getUserBadges(userId: string): Promise<DisplayBadge[]> {
  try {
    const { data, error } = await adminSupabase
      .from("player_badges")
      .select(
        "earned_at, source_run_id, source_weekly_challenge_id, season_id, badges(slug, name, description, category, tier, mode, icon_key, is_active, is_hidden, sort_order)"
      )
      .eq("user_id", userId)
      .order("earned_at", { ascending: false });

    if (error || !data) return [];

    return (data as unknown as PlayerBadgeRow[])
      .filter((row) => row.badges?.is_active)
      .map((row) => {
        const b = row.badges!;
        return {
          slug: b.slug,
          status: b.is_hidden ? "hidden" : "earned",
          name: b.name,
          description: b.description,
          category: b.category,
          tier: b.tier,
          mode: b.mode,
          iconKey: b.icon_key,
          earnedAt: row.earned_at,
          sortOrder: b.sort_order,
          evidence: {
            sourceRunId: row.source_run_id,
            sourceWeeklyChallengeId: row.source_weekly_challenge_id,
            seasonId: row.season_id,
          },
        } satisfies DisplayBadge;
      });
  } catch {
    return [];
  }
}

/** Badges for many users in one query (e.g. a whole lobby fireteam) instead
 * of one getUserBadges() call per member. Same visibility rules as
 * getUserBadges — each user's own hidden badges are included in their own
 * entry, keyed by user_id so a missing key just means "no badges yet". */
export async function getUsersBadges(userIds: string[]): Promise<Record<string, DisplayBadge[]>> {
  if (userIds.length === 0) return {};
  try {
    const { data, error } = await adminSupabase
      .from("player_badges")
      .select(
        "user_id, earned_at, source_run_id, source_weekly_challenge_id, season_id, badges(slug, name, description, category, tier, mode, icon_key, is_active, is_hidden, sort_order)"
      )
      .in("user_id", userIds)
      .order("earned_at", { ascending: false });

    if (error || !data) return {};

    const out: Record<string, DisplayBadge[]> = {};
    for (const row of data as unknown as Array<PlayerBadgeRow & { user_id: string }>) {
      if (!row.badges?.is_active) continue;
      const b = row.badges;
      const badge: DisplayBadge = {
        slug: b.slug,
        status: b.is_hidden ? "hidden" : "earned",
        name: b.name,
        description: b.description,
        category: b.category,
        tier: b.tier,
        mode: b.mode,
        iconKey: b.icon_key,
        earnedAt: row.earned_at,
        sortOrder: b.sort_order,
        evidence: {
          sourceRunId: row.source_run_id,
          sourceWeeklyChallengeId: row.source_weekly_challenge_id,
          seasonId: row.season_id,
        },
      };
      (out[row.user_id] ??= []).push(badge);
    }
    return out;
  } catch {
    return {};
  }
}

/** The full Badge Case for a user: every active, non-hidden badge in the
 * catalog (earned or not), plus the user's own hidden earned badges mixed
 * in. A hidden badge the user hasn't earned never appears here — its name
 * and criteria must not leak to someone who hasn't unlocked it. */
export async function getBadgeCatalog(userId: string): Promise<CatalogBadge[]> {
  try {
    const [{ data: catalog, error: catalogError }, earned] = await Promise.all([
      adminSupabase
        .from("badges")
        .select("slug, name, description, category, tier, mode, icon_key, is_active, is_hidden, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      getUserBadges(userId),
    ]);

    if (catalogError || !catalog) return [];

    const earnedBySlug = new Map(earned.map((b) => [b.slug, b]));

    const visible = (catalog as BadgeRow[]).filter((b) => !b.is_hidden || earnedBySlug.has(b.slug));

    return visible.map((b) => {
      const own = earnedBySlug.get(b.slug);
      return {
        slug: b.slug,
        earned: Boolean(own),
        name: b.name,
        description: b.description,
        category: b.category,
        tier: b.tier,
        mode: b.mode,
        iconKey: b.icon_key,
        sortOrder: b.sort_order,
        earnedAt: own?.earnedAt ?? null,
      } satisfies CatalogBadge;
    });
  } catch {
    return [];
  }
}
