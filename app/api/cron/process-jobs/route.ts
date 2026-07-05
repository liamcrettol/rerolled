import { NextRequest, NextResponse } from "next/server";
import { processWorkerJobs } from "@/lib/scoreAttack/worker/process";

// Drains the challenge-platform worker queue (#255). Scheduled from GitHub
// Actions (Vercel Hobby can't do sub-daily crons), same pattern as
// /api/cron/detect-games. Protected by CRON_SECRET when set.
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
    const result = await processWorkerJobs({ maxJobs: 25 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/process-jobs] failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
