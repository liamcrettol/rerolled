import { adminSupabase } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import WatchView, { type WatchMember, type WatchGame } from "./WatchView";
import type { LobbyLoadoutSlot } from "@/types/lobby";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const { data: lobby } = await adminSupabase
    .from("lobbies")
    .select("id, code, current_round, status")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!lobby) notFound();

  const { data: round } = await adminSupabase
    .from("lobby_rounds")
    .select("id")
    .eq("lobby_id", lobby.id)
    .eq("round_number", lobby.current_round)
    .maybeSingle();

  let initialSlots: LobbyLoadoutSlot[] = [];
  if (round) {
    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("*")
      .eq("round_id", round.id);
    initialSlots = slots ?? [];
  }

  const { data: memberRows } = await adminSupabase
    .from("lobby_members")
    .select("id, user_id, display_name, is_captain, selected_character_id")
    .eq("lobby_id", lobby.id)
    .order("joined_at", { ascending: true });

  const initialMembers: WatchMember[] = (memberRows ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    displayName: m.display_name,
    isCaptain: m.is_captain,
    hasCharacter: !!m.selected_character_id,
  }));

  const { data: lastSession } = await adminSupabase
    .from("game_sessions")
    .select("id, map_name, played_at, player_game_stats(*)")
    .eq("lobby_id", lobby.id)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initialLastGame: WatchGame | null = lastSession
    ? {
        sessionId: lastSession.id,
        mapName: (lastSession.map_name as string | null) ?? null,
        stats: (lastSession.player_game_stats ?? []).map((s) => ({
          userId: s.user_id,
          displayName: s.display_name,
          kills: s.kills,
          deaths: s.deaths,
          assists: s.assists,
          won: s.won as boolean | null,
        })),
      }
    : null;

  // Fetch cumulative stats for all games in this lobby (for lobby leaderboard)
  const { data: allGameStats } = await adminSupabase
    .from("game_sessions")
    .select("player_game_stats(user_id, display_name, kills)")
    .eq("lobby_id", lobby.id);

  // Aggregate kills by user
  const lobbyLeaderboardMap = new Map<string, { displayName: string; gamesPlayed: number; totalKills: number }>();
  if (allGameStats) {
    for (const session of allGameStats) {
      const stats = session.player_game_stats || [];
      for (const stat of stats) {
        const existing = lobbyLeaderboardMap.get(stat.user_id);
        if (existing) {
          existing.gamesPlayed += 1;
          existing.totalKills += stat.kills;
        } else {
          lobbyLeaderboardMap.set(stat.user_id, {
            displayName: stat.display_name,
            gamesPlayed: 1,
            totalKills: stat.kills,
          });
        }
      }
    }
  }

  const initialLobbyLeaderboard = Array.from(lobbyLeaderboardMap.entries())
    .map(([userId, data]) => ({
      userId,
      displayName: data.displayName,
      gamesPlayed: data.gamesPlayed,
      totalKills: data.totalKills,
    }))
    .sort((a, b) => b.totalKills - a.totalKills);

  return (
    <main className="min-h-screen p-6 w-full max-w-2xl mx-auto">
      <WatchView
        lobbyId={lobby.id}
        code={lobby.code}
        initialRoundNumber={lobby.current_round}
        initialRoundId={round?.id ?? null}
        initialSlots={initialSlots}
        initialMembers={initialMembers}
        initialStatus={lobby.status}
        initialLastGame={initialLastGame}
        initialLobbyLeaderboard={initialLobbyLeaderboard}
      />
    </main>
  );
}
