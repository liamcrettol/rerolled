import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import weaponsTable from "@/lib/bungie/data/weapons-table.json";

type WeaponEntry = { name: string; icon: string };
const weapons = weaponsTable as Record<string, WeaponEntry>;

export async function GET(req: NextRequest) {
  const lobbyId = req.nextUrl.searchParams.get("lobbyId");
  if (!lobbyId) return NextResponse.json({ error: "lobbyId required" }, { status: 400 });

  try {
    const { data: sessions, error: sessionsError } = await adminSupabase
      .from("game_sessions")
      .select("id, played_at, player_count, roulette_hashes, round_id, map_name")
      .eq("lobby_id", lobbyId)
      .order("played_at", { ascending: true });
    if (sessionsError) throw new Error(sessionsError.message);

    if (!sessions || sessions.length === 0) return NextResponse.json({ rounds: [] });

    const sessionIds = sessions.map((s) => s.id);
    const roundIds = sessions.map((s) => s.round_id).filter(Boolean) as string[];

    const [{ data: allStats, error: statsError }, { data: weaponKills, error: weaponKillsError }, { data: loadoutSlots, error: slotsError }, { data: roundRows, error: roundsError }] = await Promise.all([
      adminSupabase.from("player_game_stats").select("*").in("game_session_id", sessionIds),
      adminSupabase.from("weapon_round_kills").select("game_session_id, item_hash, total_kills").in("game_session_id", sessionIds),
      roundIds.length > 0
        ? adminSupabase.from("lobby_loadout_slots").select("round_id, slot, item_hash, weapon_name, weapon_icon").in("round_id", roundIds)
        : Promise.resolve({ data: [], error: null }),
      roundIds.length > 0
        ? adminSupabase.from("lobby_rounds").select("id, round_number").in("id", roundIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (statsError) throw new Error(statsError.message);
    if (weaponKillsError) throw new Error(weaponKillsError.message);
    if (slotsError) throw new Error(slotsError.message);
    if (roundsError) throw new Error(roundsError.message);

    // Index loadout slots by round_id for fast lookup
    const slotsByRound = new Map<string, typeof loadoutSlots>();
    for (const s of loadoutSlots ?? []) {
      const list = slotsByRound.get(s.round_id) ?? [];
      list.push(s);
      slotsByRound.set(s.round_id, list);
    }

    // Real round numbers keyed by round_id (positional index drifts if a round
    // produced no session).
    const roundNumById = new Map<string, number>();
    for (const r of roundRows ?? []) roundNumById.set(r.id, r.round_number);

    const rounds = sessions.map((session, i) => {
      const killsByHash = new Map<number, number>();
      for (const w of weaponKills ?? []) {
        if (w.game_session_id === session.id) killsByHash.set(w.item_hash, w.total_kills);
      }
      // Reconstruct weapons rolled that round (kinetic / energy / power)
      const roundSlots = session.round_id ? (slotsByRound.get(session.round_id) ?? []) : [];
      const weaponsRolled: Record<string, { name: string; icon: string }> = {};
      for (const s of roundSlots) {
        if (s.item_hash && s.item_hash !== 0 && s.weapon_name) {
          weaponsRolled[s.slot] = { name: s.weapon_name, icon: s.weapon_icon ?? "" };
        }
      }

      return {
        sessionId: session.id,
        playedAt: session.played_at,
        roundNum: (session.round_id ? roundNumById.get(session.round_id) : undefined) ?? i + 1,
        mapName: (session.map_name as string | null) ?? null,
        weapons: Object.keys(weaponsRolled).length > 0 ? weaponsRolled : undefined,
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
  } catch (err) {
    console.error("[stats/history] failed to load round history", {
      lobbyId,
      reason: err instanceof Error ? err.message : "unknown error",
    });
    return NextResponse.json({ error: "Unable to load match history" }, { status: 500 });
  }
}
