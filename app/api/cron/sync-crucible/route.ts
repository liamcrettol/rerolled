import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import {
  claimCrucibleSync,
  failCrucibleSync,
  syncNextCrucibleHistoryPage,
} from "@/lib/crucible/sync";

// Background Crucible history backfill (see .github/workflows/sync-crucible.yml).
// Each run claims queued users and walks their history a page at a time until
// the time budget is spent, pre-loading everyone's back-catalogue so it is
// already there when they open the app.
//
// Reliability: a single user's failure is isolated (they are parked, the run
// continues) and the whole handler is wrapped so a transient blip still returns
// 200. That keeps the scheduled job green instead of emailing on every hiccup;
// real breakage (a 404/401 from a bad deploy) still surfaces to the workflow.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const workerId = `crucible-${Math.random().toString(36).slice(2, 8)}`;
  const result = { claimed: 0, completed: 0, failed: 0, activities: 0, matches: 0 };

  try {
    while (result.claimed < 25 && Date.now() - startedAt < 48_000) {
      const state = await claimCrucibleSync(workerId);
      if (!state) break;
      result.claimed++;
      try {
        const synced = await syncNextCrucibleHistoryPage(state.user_id);
        result.completed++;
        result.activities += synced.processedActivities;
        result.matches += synced.importedMatches;
      } catch (error) {
        await failCrucibleSync(state.user_id, error).catch(() => {});
        result.failed++;
        console.error("[cron/sync-crucible] user sync failed:", state.user_id, error instanceof Error ? error.message : error);
      }
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/sync-crucible] run error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), ...result });
  }
}
