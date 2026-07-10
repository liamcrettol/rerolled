import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { isBungieAuthErrorMessage } from "@/lib/auth/bungieErrors";
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
  // Users whose sync failed because their Bungie sign-in is dead. That is a
  // user problem, not an infra problem: they are parked until they sign in
  // again, reported here so someone can ping them, and deliberately kept out
  // of `failed` so a dead token cannot keep the scheduled run permanently red.
  const needsReauth: SyncFailure[] = [];

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
        if (isBungieAuthErrorMessage(message)) {
          needsReauth.push({ userId: state.user_id, error: message });
          console.warn("[cron/sync-crucible] user parked until re-auth:", state.user_id, message);
        } else {
          result.failed++;
          failures.push({ userId: state.user_id, error: message });
          console.error("[cron/sync-crucible] user sync failed:", state.user_id, message);
        }
      }
    }

    const queuedRemaining = await countDueQueuedSyncs(new Date().toISOString());

    // Bound pgcr_cache growth: raw PGCRs already extracted into
    // crucible_matches are pruned after 24h (migration 052). Maintenance only;
    // never fail the run for it.
    let pruned = 0;
    try {
      const { data: prunedRows, error: pruneError } = await adminSupabase.rpc("prune_pgcr_cache");
      if (!pruneError && typeof prunedRows === "number") pruned = prunedRows;
    } catch {
      // ignore; the next run retries
    }

    // Name the parked users so the run summary says who to ping, not just ids.
    let needsReauthNamed: Array<SyncFailure & { displayName?: string }> = needsReauth;
    if (needsReauth.length > 0) {
      try {
        const { data: userRows } = await adminSupabase
          .from("users")
          .select("id, display_name")
          .in("id", needsReauth.map((entry) => entry.userId));
        const names = new Map((userRows ?? []).map((row: { id: string; display_name: string | null }) => [row.id, row.display_name]));
        needsReauthNamed = needsReauth.map((entry) => ({ ...entry, displayName: names.get(entry.userId) ?? undefined }));
      } catch {
        // Names are a nicety; the ids already identify the users.
      }
    }

    const health = evaluateCrucibleSyncHealth(result, queuedBefore);
    const payload = {
      ok: health.ok,
      state: health.state,
      message: health.message,
      workerId,
      queuedBefore,
      queuedRemaining,
      pruned,
      ...result,
      failures,
      needsReauth: needsReauthNamed,
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
      needsReauth,
      durationMs: Date.now() - startedAt,
    };

    console.error("[cron/sync-crucible] run error:", message);
    return NextResponse.json(payload, { status: 500 });
  }
}
