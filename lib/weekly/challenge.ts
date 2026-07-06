// Active weekly challenge source (#245).
//
// Reads the current active weekly challenge from the weekly_challenges table
// (migration 025). Returns null when none is published/active — the hero then
// shows its clean "No active week" state (#251). Every failure path degrades to
// null so a missing migration or empty DB never crashes the home shell.

import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";
import type { WeeklyChallenge } from "@/types/platform";
import { toPlatformChallenge } from "@/lib/challenges/present";

export async function getActiveWeeklyChallenge(): Promise<WeeklyChallenge | null> {
  try {
    const { data, error } = await withSupabaseTimeout(
      adminSupabase
        .from("weekly_challenges")
        .select("*, seasons(season_key)")
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (error || !data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seasonKey = (data as any).seasons?.season_key ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return toPlatformChallenge(data as any, seasonKey);
  } catch {
    return null;
  }
}
