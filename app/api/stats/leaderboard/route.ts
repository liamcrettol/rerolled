import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const { data } = await adminSupabase
    .from("player_game_stats")
    .select("user_id, display_name, roulette_weapon_kills, kd, won");

  if (!data?.length) return NextResponse.json({ entries: [] });

  const byUser = new Map<string, {
    userId: string;
    displayName: string;
    gamesPlayed: number;
    totalRouletteKills: number;
    avgKd: number;
    wins: number;
    losses: number;
  }>();

  for (const row of data) {
    const existing = byUser.get(row.user_id);
    if (existing) {
      existing.totalRouletteKills += row.roulette_weapon_kills;
      existing.avgKd =
        (existing.avgKd * existing.gamesPlayed + Number(row.kd)) / (existing.gamesPlayed + 1);
      existing.gamesPlayed += 1;
      if (row.won === true) existing.wins += 1;
      else if (row.won === false) existing.losses += 1;
    } else {
      byUser.set(row.user_id, {
        userId: row.user_id,
        displayName: row.display_name,
        gamesPlayed: 1,
        totalRouletteKills: row.roulette_weapon_kills,
        avgKd: Number(row.kd),
        wins: row.won === true ? 1 : 0,
        losses: row.won === false ? 1 : 0,
      });
    }
  }

  const entries = [...byUser.values()].sort(
    (a, b) => b.totalRouletteKills - a.totalRouletteKills
  );

  return NextResponse.json({ entries });
}
