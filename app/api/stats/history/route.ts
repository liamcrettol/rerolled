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
    .select("id, played_at, player_count, roulette_hashes, round_id, map_name")
    .eq("lobby_id", lobbyId)
    .order("played_at", { ascending: true });

  if (!sessions || sessions.length === 0) return NextResponse.json({ rounds: [] });

  const sessionIds = sessions.map((s) => s.id);
  const roundIds = sessions.map((s) => s.round_id).filter(Boolean) as string[];

  const [{ data: allStats }, { data: weaponKills }, { data: loadoutSlots }] = await Promise.all([
    adminSupabase.from("player_game_stats").select("*").in("game_session_id", sessionIds),
    adminSupabase.from("weapon_round_kills").select("game_session_id, item_hash, total_kills").in("game_session_id", sessionIds),
    roundIds.length > 0
      ? adminSupabase.from("lobby_loadout_slots").select("round_id, slot, item_hash, weapon_name, weapon_icon").in("round_id", roundIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Index loadout slots by round_id for fast lookup
  const slotsByRound = new Map<string, typeof loadoutSlots>();
  for (const s of loadoutSlots ?? []) {
    const list = slotsByRound.get(s.round_id) ?? [];
    list.push(s);
    slotsByRound.set(s.round_id, list);
  }

  const rounds = sessions.map((session, i) => {
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
      roundNum: i + 1,
      mapName: (session.map_name as string | null) ?? null,
      weapons: Object.keys(weaponsRolled).length > 0 ? weaponsRolled : undefined,
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
