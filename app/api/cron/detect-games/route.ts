import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { getBungieToken } from "@/lib/auth/helpers";
import { detectAndRecordGame } from "@/lib/stats/record";
import { assertCronAuth } from "@/lib/auth/cron";
import { closeIdleLobbies } from "@/lib/lobby";

// Triggered by Supabase pg_cron + pg_net with Authorization: Bearer CRON_SECRET.
// It finds lobbies that have a pending apply
// but no saved game session and runs PGCR detection for each - so stats get
// captured even when nobody has the page open.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many lobbies to detect at once. Bungie throttles per app key, so this is
// deliberately small: past a handful, extra parallelism buys 429s, not speed.
const LOBBY_CONCURRENCY = 4;
// Stop picking up new lobbies with headroom left, so in-flight writes finish
// instead of being killed mid-request. Leftovers are retried next run.
const DEADLINE_MS = 50_000;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  // Mark lobbies idle for >2 hours as done so they stop accumulating.
  const idleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await closeIdleLobbies(idleCutoff);

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

  // Skip any lobbies that are done (ended by captain, last-member-leave, or idle timeout above)
  const { data: lobbyStatuses } = await adminSupabase
    .from("lobbies")
    .select("id, status")
    .in("id", stuck.map((s) => s.lobbyId));

  const doneIds = new Set((lobbyStatuses ?? []).filter((l) => l.status === "done").map((l) => l.id));
  const activeStuck = stuck.filter((s) => !doneIds.has(s.lobbyId));

  if (!activeStuck.length) {
    return NextResponse.json({ processed: 0, message: "All pending lobbies are already done" });
  }

  let processed = 0;
  const errors: string[] = [];
  let timedOut = false;

  // Work is linear in active lobbies but the function timeout is constant, so a
  // serial loop silently truncates as the app grows. Run a few lobbies at a
  // time (Bungie throttles per app key, so unbounded fan-out would just trade
  // timeouts for 429s) and stop starting new ones before the deadline.
  const deadline = Date.now() + DEADLINE_MS;

  async function processLobby({
    lobbyId,
    roundId,
    appliedAt,
  }: {
    lobbyId: string;
    roundId: string;
    appliedAt: string;
  }): Promise<void> {
    try {
      const { data: members } = await adminSupabase
        .from("lobby_members")
        .select("user_id, display_name, bungie_membership_type, bungie_membership_id, selected_character_id")
        .eq("lobby_id", lobbyId);

      if (!members?.length) return;

      const memberInputs = members
        .filter((m) => m.selected_character_id)
        .map((m) => ({
          userId: m.user_id,
          displayName: m.display_name,
          membershipType: m.bungie_membership_type,
          membershipId: m.bungie_membership_id,
          characterId: m.selected_character_id!,
        }));

      if (memberInputs.length < 2) return;

      const { data: slots } = await adminSupabase
        .from("lobby_loadout_slots")
        .select("item_hash")
        .eq("round_id", roundId);

      const rouletteHashes = [...new Set(
        (slots ?? []).map((s) => s.item_hash).filter((h: number) => h !== 0)
      )];

      if (!rouletteHashes.length) return;

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
          // this member's token expired and can't refresh - try the next
        }
      }

      if (!token || !tokenOwnerUserId) {
        errors.push(`${lobbyId}: no usable member token`);
        return;
      }

      // Same shared pipeline the client detect route uses, so recording stays
      // identical across both paths. No lease needed here: the cron is the
      // backstop and the unique index still guards against a concurrent insert.
      const outcome = await detectAndRecordGame({
        lobbyId,
        roundId,
        appliedAt,
        members: memberInputs,
        rouletteHashes,
        token,
        tokenOwnerUserId,
      });

      if (outcome.status === "no_game") return;
      processed++;
    } catch (e) {
      errors.push(`${lobbyId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const queue = [...activeStuck];
  const workers = Array.from(
    { length: Math.min(LOBBY_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        if (Date.now() > deadline) {
          timedOut = true;
          return;
        }
        const next = queue.shift();
        if (!next) return;
        await processLobby(next);
      }
    }
  );
  await Promise.all(workers);

  return NextResponse.json({
    processed,
    stuck: activeStuck.length,
    skipped: queue.length,
    timedOut,
    errors,
  });
}
