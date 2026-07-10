import { adminSupabase } from "@/lib/supabase/admin";
import { isBungieAuthErrorMessage } from "@/lib/auth/bungieErrors";
import type { CrucibleSyncState } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const SYNC_FRESHNESS_MS = 6 * 60 * 60 * 1000;

export async function queueCrucibleSync(
  userId: string,
  db: Db = adminSupabase,
  options: { fromSignIn?: boolean } = {},
): Promise<CrucibleSyncState | null> {
  const { data: existing, error: readError } = await db
    .from("crucible_sync_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) {
    // The app may deploy before migration 049 reaches a preview database.
    if (String(readError.message ?? readError).includes("crucible_sync_state")) return null;
    throw new Error(`sync state read failed: ${readError.message ?? readError}`);
  }

  const now = new Date();
  if (!existing) {
    const { data, error } = await db.from("crucible_sync_state").insert({
      user_id: userId,
      status: "queued",
      requested_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).select("*").single();
    if (error) throw new Error(`sync queue insert failed: ${error.message}`);
    return data as CrucibleSyncState;
  }

  if (existing.status === "queued" || existing.status === "syncing") return existing as CrucibleSyncState;
  // A user parked for a dead or cross-app refresh token stays parked until they
  // actually sign in again (the OAuth callback passes fromSignIn). Re-queueing
  // them from a mere page view would just re-run the same doomed refresh.
  if (
    existing.status === "failed" &&
    !options.fromSignIn &&
    typeof existing.last_error === "string" &&
    isBungieAuthErrorMessage(existing.last_error)
  ) {
    return existing as CrucibleSyncState;
  }
  const lastSync = existing.last_incremental_sync_at ?? existing.backfill_completed_at;
  if (lastSync && now.getTime() - new Date(lastSync).getTime() < SYNC_FRESHNESS_MS) {
    return existing as CrucibleSyncState;
  }

  const { data, error } = await db.from("crucible_sync_state").update({
    status: "queued",
    next_page: 0,
    active_character_index: 0,
    requested_at: now.toISOString(),
    updated_at: now.toISOString(),
    locked_by: null,
    locked_until: null,
    last_error: null,
    attempts: 0,
  }).eq("user_id", userId).select("*").single();
  if (error) throw new Error(`sync queue update failed: ${error.message}`);
  return data as CrucibleSyncState;
}

