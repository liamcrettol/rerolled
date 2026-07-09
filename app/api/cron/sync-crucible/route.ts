import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import {
  claimCrucibleSync,
  failCrucibleSync,
  syncNextCrucibleHistoryPage,
} from "@/lib/crucible/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const workerId = `crucible-${Math.random().toString(36).slice(2, 8)}`;
  const result = { claimed: 0, completed: 0, failed: 0, activities: 0, matches: 0 };

  while (result.claimed < 5 && Date.now() - startedAt < 48_000) {
    const state = await claimCrucibleSync(workerId);
    if (!state) break;
    result.claimed++;
    try {
      const synced = await syncNextCrucibleHistoryPage(state.user_id);
      result.completed++;
      result.activities += synced.processedActivities;
      result.matches += synced.importedMatches;
    } catch (error) {
      await failCrucibleSync(state.user_id, error);
      result.failed++;
      console.error("[cron/sync-crucible] user sync failed:", state.user_id, error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

