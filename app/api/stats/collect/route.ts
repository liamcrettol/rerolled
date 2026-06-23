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

    // Anchor to the most recent apply so duplicate calls can't create two sessions
    const { data: recentHistory } = await adminSupabase
      .from("roll_history")
      .select("applied_at, round_id")
      .eq("lobby_id", lobbyId)
      .not("applied_at", "is", null)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentHistory?.applied_at) return NextResponse.json({ ok: true, skipped: true, reason: "no apply found" });

    const appliedAt = recentHistory.applied_at as string;

    // Race check: don't create a duplicate session for this round
    const { data: existing } = await adminSupabase
      .from("game_sessions")
      .select("id, player_game_stats(*)")
      .eq("lobby_id", lobbyId)
      .gte("played_at", appliedAt)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, stats: existing.player_game_stats });
    }

    // Use current round's slots only (not all historical rounds)
    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("item_hash")
      .eq("round_id", recentHistory.round_id);

    const rouletteHashes = [...new Set(
      (slots ?? []).map((s) => s.item_hash).filter((h) => h !== 0)
    )];

    if (!rouletteHashes.length) return NextResponse.json({ ok: true, skipped: true, reason: "no weapons rolled" });

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

    const result = await collectPostMatchStats(memberInputs, rouletteHashes, hostToken, session.userId);
    if (!result) {
      return NextResponse.json({ ok: true, skipped: true, reason: "pgcr not found" });
    }

    const { playerStats, weaponKills } = result;

    // Final race check right before insert
    const { data: raceCheck } = await adminSupabase
      .from("game_sessions")
      .select("id")
      .eq("lobby_id", lobbyId)
      .gte("played_at", appliedAt)
      .limit(1)
      .maybeSingle();

    if (raceCheck) return NextResponse.json({ ok: true, stats: playerStats });

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
        won: s.won,
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
