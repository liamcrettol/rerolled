import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { closeIdleLobbies } from "@/lib/lobby";

const IDLE_CLOSE_MS = 2 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const now = new Date().toISOString();
  const idleCutoff = new Date(Date.now() - IDLE_CLOSE_MS).toISOString();

  // Mark stale lobbies done instead of deleting them. That preserves history but
  // stops active clients from keeping lobby channels and polling paths alive.
  const { data, error } = await closeIdleLobbies(idleCutoff, now)
    .select("id, code, status, last_active_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    closed: data?.length ?? 0,
    idleCutoff,
    lobbies: data ?? [],
  });
}
