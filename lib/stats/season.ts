// "Your Season" stats source (#250).
//
// Reads the viewing user's aggregated season stats from player_season_stats
// (migration 030) for the active season, resolving their favorite weapon hash to
// a readable name. New/empty users get a clean zeroed summary. All failures
// degrade to the empty state so the panel never breaks.

import { adminSupabase } from "@/lib/supabase/admin";
import { getWeaponDefinitions } from "@/lib/bungie/definitions";
import type { SeasonStats } from "@/types/platform";
import {
  toPlatformSeasonStats,
  emptySeasonStats,
  type SeasonRow,
  type PlayerSeasonStatsRow,
} from "@/lib/challenges/present";

const FALLBACK_SEASON: SeasonRow = { season_key: "", display_name: "Season" };

async function resolveFavoriteWeapon(userId: string): Promise<SeasonStats["bestWeapon"]> {
  try {
    const { data } = await adminSupabase
      .from("player_lifetime_stats")
      .select("favorite_weapon_hash, total_rolled_weapon_kills")
      .eq("user_id", userId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    if (!row?.favorite_weapon_hash) return null;
    const defs = await getWeaponDefinitions([Number(row.favorite_weapon_hash)]);
    const def = defs.get(Number(row.favorite_weapon_hash));
    if (!def) return null;
    return { name: def.name, kills: row.total_rolled_weapon_kills ?? 0 };
  } catch {
    return null;
  }
}

export async function getSeasonStats(userId: string): Promise<SeasonStats> {
  try {
    const { data: season } = await adminSupabase
      .from("seasons")
      .select("id, season_key, display_name")
      .eq("status", "active")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = season as any;
    if (!s) return emptySeasonStats(FALLBACK_SEASON);

    const [{ data: statsRow }, bestWeapon] = await Promise.all([
      adminSupabase
        .from("player_season_stats")
        .select("total_runs, total_weapon_kills, weekly_clears, best_weekly_rank")
        .eq("user_id", userId)
        .eq("season_id", s.id)
        .maybeSingle(),
      resolveFavoriteWeapon(userId),
    ]);

    return toPlatformSeasonStats(
      (statsRow as PlayerSeasonStatsRow | null) ?? null,
      { season_key: s.season_key, display_name: s.display_name },
      bestWeapon,
    );
  } catch {
    return emptySeasonStats(FALLBACK_SEASON);
  }
}
