import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { detectAndRecordGame } from "@/lib/stats/record";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const schema = z.object({ lobbyId: z.string().uuid() });

// How long one worker holds the detection slot. Slightly longer than the client
// poll interval so a single scan covers a cycle without the herd piling on, but
// short enough that detection isn't delayed if that worker bails.
const DETECT_LEASE_SECONDS = 20;

export async function POST(req: NextRequest) {
  const t = Date.now();
  let log: ReturnType<typeof createLogger> | null = null;
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);
    const { lobbyId } = schema.parse(await req.json());
    log.info("detect.start", { lobbyId });

    // ── Step 0: Bail out if this lobby's session has already ended ──────────
    const { data: lobbyStatus } = await adminSupabase
      .from("lobbies")
      .select("status")
      .eq("id", lobbyId)
      .single();

    if (!lobbyStatus || lobbyStatus.status === "done") {
      log.info("detect.skipped", { lobbyId, reason: "lobby_done" });
      await log.flush();
      return NextResponse.json({ done: false, pending: false });
    }

    // ── Step 1: Find the most recent apply time for this lobby ──────────────
    const { data: recentHistory } = await adminSupabase
      .from("roll_history")
      .select("applied_at, round_id")
      .eq("lobby_id", lobbyId)
      .not("applied_at", "is", null)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentHistory?.applied_at) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: false });
    }

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
      log.info("detect.skipped", { lobbyId, reason: "already_detected" });
      await log.flush();
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

    if (!members?.length) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false });
    }

    const memberInputs = members
      .filter((m) => m.selected_character_id)
      .map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        membershipType: m.bungie_membership_type,
        membershipId: m.bungie_membership_id,
        characterId: m.selected_character_id!,
      }));

    if (memberInputs.length < 2) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    // ── Step 4: Get CURRENT round's loadout slots only ────────────────────
    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("item_hash")
      .eq("round_id", recentHistory.round_id);

    const rouletteHashes = [...new Set(
      (slots ?? []).map((s) => s.item_hash).filter((h) => h !== 0)
    )];

    if (!rouletteHashes.length) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    const callerMember = members.find((m) => m.user_id === session.userId);
    if (!callerMember?.selected_character_id) {
      log.info("detect.skipped", { lobbyId, reason: "no_apply" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    // ── Step 5: Get the caller's token BEFORE claiming ───────────────────────
    // Fetch the token first so a member with a dead refresh token fails here
    // instead of grabbing the lease and blocking everyone else for its TTL.
    const token = await getBungieToken(session.userId);

    // ── Step 6: Claim the detection slot ─────────────────────────────────────
    // Only one worker scans Bungie per cycle; everyone else returns pending and
    // picks up the recorded game via realtime. Avoids N redundant PGCR scans.
    const { data: claimed } = await adminSupabase.rpc("claim_detection", {
      p_round_id: recentHistory.round_id,
      p_ttl_seconds: DETECT_LEASE_SECONDS,
    });
    if (!claimed) {
      log.info("detect.skipped", { lobbyId, reason: "lease_taken" });
      await log.flush();
      return NextResponse.json({ done: false, pending: true });
    }

    log.info("detect.claimed", { lobbyId, roundId: recentHistory.round_id });

    // ── Step 7: Scan + record via the shared pipeline ────────────────────────
    const outcome = await detectAndRecordGame({
      lobbyId,
      roundId: recentHistory.round_id,
      appliedAt,
      members: memberInputs,
      rouletteHashes,
      token,
      tokenOwnerUserId: session.userId,
    });

    const found = outcome.status !== "no_game";
    log.info("detect.done", { lobbyId, roundId: recentHistory.round_id, found, durationMs: Date.now() - t });
    await log.flush();

    if (outcome.status === "no_game") return NextResponse.json({ done: false, pending: true });
    return NextResponse.json({ done: true, stats: outcome.stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    const errLog = log ?? createLogger(req);
    errLog.error("detect.error", { error: msg, durationMs: Date.now() - t });
    await errLog.flush();
    return NextResponse.json({ error: msg }, { status });
  }
}
