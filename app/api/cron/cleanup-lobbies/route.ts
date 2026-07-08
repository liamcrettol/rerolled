import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

const IDLE_CLOSE_MS = 2 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date().toISOString();
  const idleCutoff = new Date(Date.now() - IDLE_CLOSE_MS).toISOString();

  // Mark stale lobbies done instead of deleting them. That preserves history but
  // stops active clients from keeping lobby channels and polling paths alive.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await adminSupabase
    .from("lobbies")
    .update({ status: "done", ended_at: now } as any)
    .neq("status", "done")
    .lt("last_active_at", idleCutoff)
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
