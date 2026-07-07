// Manual badge grants (#297) — for status/legacy badges (status_founder,
// status_developer, status_advisor, status_invict, criteria.rule =
// "manual_grant" per migration 037) that are never awarded by a run
// evaluator. Kept separate from lib/badges/evaluators.ts so status grants
// can't be triggered by run/challenge data, and evaluators can't accidentally
// award a status badge.

import { adminSupabase } from "@/lib/supabase/admin";

export interface GrantBadgeResult {
  ok: boolean;
  error?: string;
}

/**
 * Grants a status/legacy badge to a user. Idempotent — granting the same
 * badge twice is a no-op (unique constraint on user_id, badge_id, scope_key;
 * status/legacy badges are non-repeatable, so scope_key is always "once").
 * Refuses to grant any badge whose criteria isn't a manual grant, so this
 * can't be used as a backdoor around the run evaluators.
 */
export async function grantBadge(userId: string, slug: string): Promise<GrantBadgeResult> {
  const { data: badge, error: badgeError } = await adminSupabase
    .from("badges")
    .select("id, is_active, criteria")
    .eq("slug", slug)
    .maybeSingle();

  if (badgeError) return { ok: false, error: badgeError.message };
  if (!badge) return { ok: false, error: `No badge with slug "${slug}"` };
  if (!badge.is_active) return { ok: false, error: `Badge "${slug}" is not active` };

  const criteria = badge.criteria as { rule?: string } | null;
  if (criteria?.rule !== "manual_grant") {
    return { ok: false, error: `Badge "${slug}" is not a manual-grant badge` };
  }

  const { error: insertError } = await adminSupabase
    .from("player_badges")
    .upsert(
      {
        user_id: userId,
        bungie_membership_id: null,
        badge_id: badge.id,
        source_run_id: null,
        source_weekly_challenge_id: null,
        season_id: null,
        scope_key: "once",
        metadata: {},
      },
      { onConflict: "user_id,badge_id,scope_key", ignoreDuplicates: true }
    );

  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true };
}
