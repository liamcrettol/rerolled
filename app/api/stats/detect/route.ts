import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { collectPostMatchStats } from "@/lib/bungie/pgcr";
import { z } from "zod";

const BUNGIE_ROOT = "https://www.bungie.net/Platform";

const schema = z.object({ lobbyId: z.string().uuid() });

async function resolveActivityName(hash: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${BUNGIE_ROOT}/Destiny2/Manifest/DestinyActivityDefinition/${hash}/`,
      { headers: { "X-API-Key": process.env.BUNGIE_API_KEY! } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json.Response?.displayProperties?.name as string) ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    // ── Step 1: Find the most recent apply time for this lobby ──────────────
    const { data: recentHistory } = await adminSupabase
      .from("roll_history")
      .select("applied_at, round_id")
      .eq("lobby_id", lobbyId)
      .not("applied_at", "is", null)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentHistory?.applied_at) return NextResponse.json({ done: false, pending: false });

    const appliedAt = recentHistory.applied_at as string;

    // ── Step 2: Check if a session already exists for THIS round ───────────
    const { data: existingSession } = await adminSupabase
      .from("game_sessions")
      .select("id, player_game_stats(*)")
      .eq("lobby_id", lobbyId)
      .gte("played_at", appliedAt)
      .order("played_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      const stats = (existingSession.player_game_stats ?? []).map((s) => ({
        userId: s.user_id,
        displayName: s.display_name,
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        kd: Number(s.kd),
        rouletteWeaponKills: s.roulette_weapon_kills,
      }));
      return NextResponse.json({ done: true, stats });
    }

    // ── Step 3: Load members ─────────────────────────────────────────────────
    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, display_name, bungie_membership_type, bungie_membership_id, selected_character_id")
      .eq("lobby_id", lobbyId);

    if (!members?.length) return NextResponse.json({ done: false });

    const memberInputs = members
      .filter((m) => m.selected_character_id)
      .map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        membershipType: m.bungie_membership_type,
        membershipId: m.bungie_membership_id,
        characterId: m.selected_character_id!,
      }));

    if (memberInputs.length < 2) return NextResponse.json({ done: false, pending: true });

    // ── Step 4: Get CURRENT round's loadout slots only ────────────────────
    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("item_hash")
      .eq("round_id", recentHistory.round_id);

    const rouletteHashes = [...new Set(
      (slots ?? []).map((s) => s.item_hash).filter((h) => h !== 0)
    )];

    if (!rouletteHashes.length) return NextResponse.json({ done: false, pending: true });

    const callerMember = members.find((m) => m.user_id === session.userId);
    if (!callerMember?.selected_character_id) return NextResponse.json({ done: false, pending: true });

    // ── Step 5: Hit Bungie PGCR ──────────────────────────────────────────────
    const token = await getBungieToken(session.userId);
    const result = await collectPostMatchStats(memberInputs, rouletteHashes, token, session.userId);
    if (!result) return NextResponse.json({ done: false, pending: true });

    const { playerStats, weaponKills, activityHash } = result;

    // ── Step 6: Race check ──────────────────────────────────────────────────
    const { data: raceCheck } = await adminSupabase
      .from("game_sessions")
      .select("id")
      .eq("lobby_id", lobbyId)
      .gte("played_at", appliedAt)
      .limit(1)
      .maybeSingle();

    if (raceCheck) return NextResponse.json({ done: true, stats: playerStats });

    // ── Step 7: Resolve map name ─────────────────────────────────────────────
    const mapName = await resolveActivityName(activityHash);

    // ── Step 8: Persist the game session ────────────────────────────────────
    const { data: gameSession } = await adminSupabase
      .from("game_sessions")
      .insert({
        lobby_id: lobbyId,
        player_count: playerStats.length,
        roulette_hashes: rouletteHashes,
        round_id: recentHistory.round_id,
        map_name: mapName,
        activity_hash: activityHash,
      })
      .select()
      .single();

    if (gameSession) {
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

      // Advance to next round - captain rotation now happens at apply time
      const { data: lobby } = await adminSupabase
        .from("lobbies")
        .select("current_round")
        .eq("id", lobbyId)
        .single();

      if (lobby) {
        const nextRound = lobby.current_round + 1;
        await adminSupabase.from("lobby_rounds").insert({
          lobby_id: lobbyId,
          round_number: nextRound,
          status: "pending",
        });
        await adminSupabase
          .from("lobby_members")
          .update({ is_ready: false })
          .eq("lobby_id", lobbyId);
        await adminSupabase
          .from("lobbies")
          .update({ current_round: nextRound, status: "waiting", last_active_at: new Date().toISOString() })
          .eq("id", lobbyId);
      }
    }

    return NextResponse.json({ done: true, stats: playerStats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
