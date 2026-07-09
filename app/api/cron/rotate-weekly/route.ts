import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { rotateWeeklyChallenges } from "@/lib/challenges/rotate";

// Rotates the weekly challenge (expire → activate → generate next week).
// Scheduled from GitHub Actions after Tuesday reset — same protected-endpoint
// pattern as /api/cron/process-jobs. Idempotent: extra invocations no-op while
// a week is live.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    // Two independent rotations - PvE and PvP each track their own
    // active/scheduled/expired lifecycle and week-number counter (#296).
    const pve = await rotateWeeklyChallenges(adminSupabase, now, "pve");
    const pvp = await rotateWeeklyChallenges(adminSupabase, now, "pvp");
    return NextResponse.json({ ok: true, pve, pvp });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/rotate-weekly] failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
