import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { adminSupabase } from "@/lib/supabase/admin";
import {
  evaluateCrucibleSyncHealth,
  type CrucibleSyncRunResult,
} from "@/lib/crucible/syncCronHealth";
import {
  claimCrucibleSync,
  failCrucibleSync,
  syncNextCrucibleHistoryPage,
} from "@/lib/crucible/sync";

// Background Crucible history backfill (see .github/workflows/sync-crucible.yml).
// Each run claims due users and walks their history a page at a time until the
// time budget is spent. Failures return non-2xx responses so the scheduled
// workflow cannot report success while the queue is stalled.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SyncFailure {
  userId: string;
  error: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function countDueQueuedSyncs(now: string): Promise<number> {
  const { count, error } = await adminSupabase
    .from("crucible_sync_state")
    .select("user_id", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("requested_at", now);

  if (error) throw new Error(`Crucible sync queue count failed: ${error.message}`);
  return count ?? 0;
}

async function moveRequeuedSyncToBack(userId: string): Promise<void> {
  const { error } = await adminSupabase
    .from("crucible_sync_state")
    .update({ requested_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "queued");

  if (error) {
    throw new Error(`Crucible sync queue rotation failed: ${error.message}`);
  }
}

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const workerId = `crucible-${Math.random().toString(36).slice(2, 8)}`;
  const result: CrucibleSyncRunResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    activities: 0,
    matches: 0,
  };
  const failures: SyncFailure[] = [];

  try {
    const queuedBefore = await countDueQueuedSyncs(new Date().toISOString());

    while (result.claimed < 25 && Date.now() - startedAt < 48_000) {
      const state = await claimCrucibleSync(workerId);
      if (!state) break;
      result.claimed++;

      try {
        const synced = await syncNextCrucibleHistoryPage(state.user_id);
        if (synced.hasMore) {
          // claim_crucible_sync orders by requested_at. Move a user that still
          // has pages remaining to the back of the queue so one deep account
          // cannot monopolize every claim while other users remain untouched.
          await moveRequeuedSyncToBack(state.user_id);
        }
        result.completed++;
        result.activities += synced.processedActivities;
        result.matches += synced.importedMatches;
      } catch (error) {
        const message = errorMessage(error);
        await failCrucibleSync(state.user_id, error).catch((parkError) => {
          console.error(
            "[cron/sync-crucible] failed to reschedule user:",
            state.user_id,
            errorMessage(parkError),
          );
        });
        result.failed++;
        failures.push({ userId: state.user_id, error: message });
        console.error("[cron/sync-crucible] user sync failed:", state.user_id, message);
      }
    }

    const queuedRemaining = await countDueQueuedSyncs(new Date().toISOString());
    const health = evaluateCrucibleSyncHealth(result, queuedBefore);
    const payload = {
      ok: health.ok,
      state: health.state,
      message: health.message,
      workerId,
      queuedBefore,
      queuedRemaining,
      ...result,
      failures,
      durationMs: Date.now() - startedAt,
    };

    console.log("[cron/sync-crucible] run summary:", payload);
    return NextResponse.json(payload, { status: health.httpStatus });
  } catch (error) {
    const message = errorMessage(error);
    const payload = {
      ok: false,
      state: "error",
      message: "The Crucible sync cron could not inspect or process the queue.",
      error: message,
      workerId,
      ...result,
      failures,
      durationMs: Date.now() - startedAt,
    };

    console.error("[cron/sync-crucible] run error:", message);
    return NextResponse.json(payload, { status: 500 });
  }
}
