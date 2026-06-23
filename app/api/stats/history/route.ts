import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const lobbyId = req.nextUrl.searchParams.get("lobbyId");
  if (!lobbyId) return NextResponse.json({ error: "lobbyId required" }, { status: 400 });

  const { data: sessions } = await adminSupabase
    .from("game_sessions")
    .select("id, played_at, player_count")
    .eq("lobby_id", lobbyId)
    .order("played_at", { ascending: true });

  if (!sessions || sessions.length === 0) return NextResponse.json({ rounds: [] });

  const sessionIds = sessions.map((s) => s.id);
  const { data: allStats } = await adminSupabase
    .from("player_game_stats")
    .select("*")
    .in("game_session_id", sessionIds);

  const rounds = sessions.map((session, i) => ({
    sessionId: session.id,
    playedAt: session.played_at,
    roundNum: i + 1,
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
      })),
  }));

  return NextResponse.json({ rounds });
}
