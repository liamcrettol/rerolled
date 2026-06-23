import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { collectPostMatchStats } from "@/lib/bungie/pgcr";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, display_name, bungie_membership_type, bungie_membership_id, selected_character_id")
      .eq("lobby_id", lobbyId);

    if (!members?.length) return NextResponse.json({ ok: true, skipped: true });

    // Get all roulette weapon hashes rolled in this lobby
    const { data: roundRows } = await adminSupabase
      .from("lobby_rounds")
      .select("id")
      .eq("lobby_id", lobbyId);

    const roundIds = (roundRows ?? []).map((r) => r.id);
    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("item_hash")
      .in("round_id", roundIds);

    const rouletteHashes = [...new Set(
      (slots ?? []).map((s) => s.item_hash).filter((h) => h !== 0)
    )];

    if (!rouletteHashes.length) return NextResponse.json({ ok: true, skipped: true });

    const callerMember = members.find((m) => m.user_id === session.userId);
    if (!callerMember?.selected_character_id) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no character selected" });
    }

    const hostToken = await getBungieToken(session.userId);

    const memberInputs = members
      .filter((m) => m.selected_character_id)
      .map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        membershipType: m.bungie_membership_type,
        membershipId: m.bungie_membership_id,
        characterId: m.selected_character_id!,
      }));

    const result = await collectPostMatchStats(memberInputs, rouletteHashes, hostToken);
    if (!result) {
      return NextResponse.json({ ok: true, skipped: true, reason: "pgcr not found" });
    }

    const { playerStats, weaponKills } = result;

    const { data: gameSession } = await adminSupabase
      .from("game_sessions")
      .insert({ lobby_id: lobbyId, player_count: playerStats.length, roulette_hashes: rouletteHashes })
      .select()
      .single();

    if (!gameSession) return NextResponse.json({ error: "Failed to save session" }, { status: 500 });

    await adminSupabase.from("player_game_stats").insert(
      playerStats.map((s) => ({
        game_session_id: gameSession.id,
        user_id: s.userId,
        display_name: s.displayName,
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        kd: s.kd,
        roulette_weapon_kills: s.rouletteWeaponKills,
      }))
    );

    if (weaponKills.length) {
      await adminSupabase.from("weapon_round_kills").insert(
        weaponKills.map((w) => ({
          game_session_id: gameSession.id,
          item_hash: w.itemHash,
          total_kills: w.totalKills,
        }))
      );
    }

    return NextResponse.json({ ok: true, stats: playerStats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
