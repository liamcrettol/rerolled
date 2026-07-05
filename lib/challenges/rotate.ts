import type { SupabaseClient } from "@supabase/supabase-js";
import { generateWeeklyChallengeAndStoreDraft, publishWeeklyChallenge } from "./publish";

// Weekly challenge rotation (#256 follow-up). One idempotent pass, safe to run
// on any schedule:
//   1. expire active challenges whose window has closed
//   2. activate scheduled challenges whose window has opened
//   3. if nothing is active afterwards, generate + publish + activate the next
//      week for the active season (window: now → next Tuesday 17:00 UTC reset)
//
// Called from /api/cron/rotate-weekly (GitHub Actions, Tuesday after reset,
// with an hourly-later retry) and `npm run weekly:rotate` for manual use.

export interface RotateResult {
  expired: string[];
  activated: string[];
  generated: string | null;
  skipped: string | null;
}

/** Next Destiny weekly reset (Tuesday 17:00 UTC) strictly after `now`. */
export function nextWeeklyReset(now: Date): Date {
  const reset = new Date(now);
  reset.setUTCHours(17, 0, 0, 0);
  // Days until Tuesday (UTC day 2); same-day counts only before 17:00 UTC.
  let days = (2 - reset.getUTCDay() + 7) % 7;
  if (days === 0 && reset.getTime() <= now.getTime()) days = 7;
  reset.setUTCDate(reset.getUTCDate() + days);
  return reset;
}

export async function rotateWeeklyChallenges(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<RotateResult> {
  const nowIso = now.toISOString();
  const result: RotateResult = { expired: [], activated: [], generated: null, skipped: null };

  // 1. Expire closed-out active weeks.
  const { data: toExpire } = await supabase
    .from("weekly_challenges")
    .select("id, slug")
    .eq("status", "active")
    .lte("ends_at", nowIso);
  for (const c of toExpire ?? []) {
    await supabase
      .from("weekly_challenges")
      .update({ status: "expired", updated_at: nowIso })
      .eq("id", c.id);
    result.expired.push(c.slug);
  }

  // 2. Activate scheduled weeks whose window has opened.
  const { data: toActivate } = await supabase
    .from("weekly_challenges")
    .select("id, slug")
    .eq("status", "scheduled")
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso);
  for (const c of toActivate ?? []) {
    const { error } = await supabase
      .from("weekly_challenges")
      .update({ status: "active", updated_at: nowIso })
      .eq("id", c.id);
    // The no-overlapping-active exclusion constraint may reject a second
    // activation in the same window — first one wins, that's fine.
    if (!error) result.activated.push(c.slug);
  }

  // 3. If a week is live now, we're done.
  const { data: active } = await supabase
    .from("weekly_challenges")
    .select("slug")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (active) {
    if (result.expired.length === 0 && result.activated.length === 0) {
      result.skipped = `"${active.slug}" is already active`;
    }
    return result;
  }

  // 4. Nothing live — generate and publish the next week for the active season.
  const { data: season } = await supabase
    .from("seasons")
    .select("id, season_key, ends_at")
    .eq("status", "active")
    .maybeSingle();
  if (!season) {
    result.skipped = "no active season to generate a weekly challenge for";
    return result;
  }
  if (new Date(season.ends_at as string).getTime() <= now.getTime()) {
    result.skipped = `active season "${season.season_key}" has ended`;
    return result;
  }

  const { data: latest } = await supabase
    .from("weekly_challenges")
    .select("week_number")
    .eq("season_id", season.id)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const weekNumber = ((latest?.week_number as number | undefined) ?? 0) + 1;

  const { challenge } = await generateWeeklyChallengeAndStoreDraft(supabase, {
    seasonKey: season.season_key as string,
    weekNumber,
    seasonId: season.id as string,
  });

  await publishWeeklyChallenge(supabase, {
    slug: challenge.slug,
    startsAt: nowIso,
    endsAt: nextWeeklyReset(now).toISOString(),
  });

  await supabase
    .from("weekly_challenges")
    .update({ status: "active", updated_at: nowIso })
    .eq("id", challenge.id);

  result.generated = challenge.slug;
  return result;
}
