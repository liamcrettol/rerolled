import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { closeIdleLobbies, getLobbyIdsAwaitingDetection } from "@/lib/lobby";

// Shares the getLobbyIdsAwaitingDetection scan with detect-games, which is
// given the same headroom below - without it this runs at the Vercel Hobby
// default of 10s while its sibling gets 60s for the identical query.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IDLE_CLOSE_MS = 2 * 60 * 60 * 1000;
// Same "still awaiting PGCR detection" window detect-games uses - a lobby in
// this set must never be marked done here, or detect-games permanently loses
// its shot at recording that match's stats.
const DETECTION_WINDOW_MS = 3 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const now = new Date().toISOString();
  const idleCutoff = new Date(Date.now() - IDLE_CLOSE_MS).toISOString();
  const detectionCutoff = new Date(Date.now() - DETECTION_WINDOW_MS).toISOString();

  const { pending, error: pendingError } = await getLobbyIdsAwaitingDetection(detectionCutoff);
  if (pendingError) {
    console.error("[cron/cleanup-lobbies] pending-detection query failed:", pendingError.message);
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  // Mark stale lobbies done instead of deleting them. That preserves history but
  // stops active clients from keeping lobby channels and polling paths alive.
  const { data, error } = await closeIdleLobbies(
    idleCutoff,
    now,
    pending.map((p) => p.lobbyId)
  ).select("id, code, status, last_active_at");

  if (error) {
    console.error("[cron/cleanup-lobbies] closeIdleLobbies failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    closed: data?.length ?? 0,
    idleCutoff,
    lobbies: data ?? [],
  });
}
