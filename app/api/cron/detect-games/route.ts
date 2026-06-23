import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { getBungieToken } from "@/lib/auth/helpers";
import { collectPostMatchStats } from "@/lib/bungie/pgcr";
import { rotateCaptain } from "@/lib/lobby";

// Vercel Cron calls this every 5 minutes with Authorization: Bearer CRON_SECRET.
// It finds lobbies that have a pending apply but no saved game session and runs
// PGCR detection for each — so stats get captured even when nobody has the page open.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Find lobbies that have an apply in the last 3 hours but no game_session after it.
  // We join through roll_history to find the apply timestamp per lobby.
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const { data: pendingApplies } = await adminSupabase
    .from("roll_history")
    .select("lobby_id, round_id, applied_at")
    .not("applied_at", "is", null)
    .gte("applied_at", cutoff)
    .order("applied_at", { ascending: false });

  if (!pendingApplies?.length) {
    return NextResponse.json({ processed: 0, message: "No pending applies" });
  }

  // Deduplicate: one entry per lobby, keeping the most recent apply
  const byLobby = new Map<string, { round_id: string; applied_at: string }>();
  for (const row of pendingApplies) {
    if (!byLobby.has(row.lobby_id)) {
      byLobby.set(row.lobby_id, { round_id: row.round_id, applied_at: row.applied_at });
    }
  }

  // Filter to lobbies that don't already have a session after their latest apply
  const lobbyIds = [...byLobby.keys()];
  const { data: existingSessions } = await adminSupabase
    .from("game_sessions")
    .select("lobby_id, played_at")
    .in("lobby_id", lobbyIds);

  const stuck: Array<{ lobbyId: string; roundId: string; appliedAt: string }> = [];
  for (const [lobbyId, { round_id, applied_at }] of byLobby) {
    const hasSession = existingSessions?.some(
      (s) => s.lobby_id === lobbyId && s.played_at >= applied_at
    );
    if (!hasSession) {
      stuck.push({ lobbyId, roundId: round_id, appliedAt: applied_at });
    }
  }

  if (!stuck.length) {
    return NextResponse.json({ processed: 0, message: "All lobbies already have sessions" });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const { lobbyId, roundId, appliedAt } of stuck) {
    try {
      const { data: members } = await adminSupabase
        .from("lobby_members")
        .select("user_id, display_name, bungie_membership_type, bungie_membership_id, selected_character_id")
        .eq("lobby_id", lobbyId);

      if (!members?.length) continue;

      const memberInputs = members
        .filter((m) => m.selected_character_id)
        .map((m) => ({
          userId: m.user_id,
          displayName: m.display_name,
          membershipType: m.bungie_membership_type,
          membershipId: m.bungie_membership_id,
          characterId: m.selected_character_id!,
        }));

      if (memberInputs.length < 2) continue;

      const { data: slots } = await adminSupabase
        .from("lobby_loadout_slots")
        .select("item_hash")
        .eq("round_id", roundId);

      const rouletteHashes = [...new Set(
        (slots ?? []).map((s) => s.item_hash).filter((h: number) => h !== 0)
      )];

      if (!rouletteHashes.length) continue;

      // Pick a fireteam member whose token we can actually use as the activity-
      // history source. It must be someone in memberInputs (so the token matches
      // the membership we query). Try each until one's token refreshes cleanly.
      let token: string | null = null;
      let tokenOwnerUserId: string | null = null;
      for (const m of memberInputs) {
        try {
          token = await getBungieToken(m.userId);
          tokenOwnerUserId = m.userId;
          break;
        } catch {
          // this member's token expired and can't refresh — try the next
        }
      }

      if (!token || !tokenOwnerUserId) {
        errors.push(`${lobbyId}: no usable member token`);
        continue;
      }

      const result = await collectPostMatchStats(memberInputs, rouletteHashes, token, tokenOwnerUserId);
      if (!result) continue;

      const { playerStats, weaponKills } = result;

      // Race check
      const { data: raceCheck } = await adminSupabase
        .from("game_sessions")
        .select("id")
        .eq("lobby_id", lobbyId)
        .gte("played_at", appliedAt)
        .limit(1)
        .maybeSingle();

      if (raceCheck) {
        processed++;
        continue;
      }

      const { data: gameSession } = await adminSupabase
        .from("game_sessions")
        .insert({ lobby_id: lobbyId, player_count: playerStats.length, roulette_hashes: rouletteHashes })
        .select()
        .single();

      if (!gameSession) continue;

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
          weaponKills.map((w: { itemHash: number; totalKills: number }) => ({
            game_session_id: gameSession.id,
            item_hash: w.itemHash,
            total_kills: w.totalKills,
          }))
        );
      }

      await rotateCaptain(lobbyId);

      const { data: currentLobby } = await adminSupabase
        .from("lobbies")
        .select("current_round")
        .eq("id", lobbyId)
        .single();

      if (currentLobby) {
        const nextRound = currentLobby.current_round + 1;
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
          .update({ current_round: nextRound, status: "waiting" })
          .eq("id", lobbyId);
      }

      processed++;
    } catch (e) {
      errors.push(`${lobbyId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ processed, stuck: stuck.length, errors });
}
