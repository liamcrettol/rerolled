import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import weaponsTable from "@/lib/bungie/data/weapons-table.json";

type WeaponEntry = { name: string; icon: string };
const weapons = weaponsTable as Record<string, WeaponEntry>;

export async function GET(req: NextRequest) {
  const lobbyId = req.nextUrl.searchParams.get("lobbyId");
  if (!lobbyId) return NextResponse.json({ error: "lobbyId required" }, { status: 400 });

  const { data: sessions } = await adminSupabase
    .from("game_sessions")
    .select("id, played_at, player_count, roulette_hashes")
    .eq("lobby_id", lobbyId)
    .order("played_at", { ascending: true });

  if (!sessions || sessions.length === 0) return NextResponse.json({ rounds: [] });

  const sessionIds = sessions.map((s) => s.id);
  const [{ data: allStats }, { data: weaponKills }] = await Promise.all([
    adminSupabase.from("player_game_stats").select("*").in("game_session_id", sessionIds),
    adminSupabase.from("weapon_round_kills").select("game_session_id, item_hash, total_kills").in("game_session_id", sessionIds),
  ]);

  const rounds = sessions.map((session, i) => {
    // "Most cursed" weapon = the rolled weapon with the fewest kills this game
    // (0 if it never appears in weapon_round_kills). Resolved to a display name.
    const killsByHash = new Map<number, number>();
    for (const w of weaponKills ?? []) {
      if (w.game_session_id === session.id) killsByHash.set(w.item_hash, w.total_kills);
    }
    let cursed: { name: string; icon: string; kills: number } | null = null;
    for (const hash of (session.roulette_hashes as number[]) ?? []) {
      const def = weapons[hash.toString()];
      if (!def) continue;
      const kills = killsByHash.get(hash) ?? 0;
      if (!cursed || kills < cursed.kills) cursed = { name: def.name, icon: def.icon, kills };
    }

    return {
      sessionId: session.id,
      playedAt: session.played_at,
      roundNum: i + 1,
      cursed,
      stats: (allStats ?? [])
        .filter((s) => s.game_session_id === session.id)
        .map((s) => ({
          userId: s.user_id,
          displayName: s.display_name,
          kills: s.kills,
          deaths: s.deaths,
          assists: s.assists,
          kd: Number(s.kd),
          rouletteWeaponKills: s.roulette_weapon_kills,
          won: s.won as boolean | null,
        })),
    };
  });

  return NextResponse.json({ rounds });
}
