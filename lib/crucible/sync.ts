import { adminSupabase } from "@/lib/supabase/admin";
import { getBungieToken } from "@/lib/auth/helpers";
import { getPGCR, resolveActivityName } from "@/lib/bungie/pgcr";
import { importCrucibleMatch } from "./importMatch";
import {
  getCrucibleActivityPage,
  getDestinyCharacterIds,
  HISTORY_PAGE_SIZE,
  type CrucibleActivityHistoryEntry,
} from "./historyClient";
import type { CrucibleSyncState } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface SyncDependencies {
  db?: Db;
  getToken?: typeof getBungieToken;
  getCharacters?: typeof getDestinyCharacterIds;
  getHistoryPage?: typeof getCrucibleActivityPage;
  getPgcr?: typeof getPGCR;
  resolveName?: typeof resolveActivityName;
  importMatch?: typeof importCrucibleMatch;
}

function parseCharacterIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export async function syncNextCrucibleHistoryPage(
  userId: string,
  dependencies: SyncDependencies = {},
): Promise<{ processedActivities: number; importedMatches: number; hasMore: boolean }> {
  const db = dependencies.db ?? adminSupabase;
  const getToken = dependencies.getToken ?? getBungieToken;
  const getCharacters = dependencies.getCharacters ?? getDestinyCharacterIds;
  const getHistoryPage = dependencies.getHistoryPage ?? getCrucibleActivityPage;
  const getPgcr = dependencies.getPgcr ?? getPGCR;
  const resolveName = dependencies.resolveName ?? resolveActivityName;
  const importer = dependencies.importMatch ?? importCrucibleMatch;

  const [{ data: account, error: accountError }, { data: state, error: stateError }] = await Promise.all([
    db.from("bungie_accounts").select("membership_id, membership_type").eq("user_id", userId).single(),
    db.from("crucible_sync_state").select("*").eq("user_id", userId).single(),
  ]);
  if (accountError || !account) throw new Error(`Bungie account unavailable: ${accountError?.message ?? "missing"}`);
  if (stateError || !state) throw new Error(`Crucible sync state unavailable: ${stateError?.message ?? "missing"}`);

  const syncState = state as CrucibleSyncState;
  const token = await getToken(userId, account.membership_id);
  let characterIds = parseCharacterIds(syncState.character_ids);
  if (characterIds.length === 0) {
    characterIds = await getCharacters(account.membership_type, account.membership_id, token);
    if (characterIds.length === 0) throw new Error("No Destiny characters were available for Crucible sync");
    const { error } = await db.from("crucible_sync_state").update({
      character_ids: characterIds,
      active_character_index: 0,
      next_page: 0,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (error) throw new Error(`Character cursor save failed: ${error.message}`);
  }

  const characterIndex = Math.min(syncState.active_character_index, characterIds.length - 1);
  const characterId = characterIds[characterIndex];
  const page = syncState.next_page;
  const activities = await getHistoryPage(
    account.membership_type,
    account.membership_id,
    characterId,
    page,
    token,
  );

  const cutoff = syncState.backfill_completed_at ? syncState.last_incremental_sync_at : null;
  let reachedCutoff = false;
  const uniqueActivities = [...new Map(
    activities.map((activity) => [activity.activityDetails.instanceId, activity] as const),
  ).values()].filter((activity) => {
    if (!cutoff) return true;
    if (new Date(activity.period).getTime() <= new Date(cutoff).getTime()) {
      reachedCutoff = true;
      return false;
    }
    return true;
  });

  let importedMatches = 0;
  const nameByHash = new Map<number, string | null>();
  for (const activity of uniqueActivities) {
    const rawPgcr = await getPgcr(activity.activityDetails.instanceId);
    if (!rawPgcr) continue;
    const activityHash = activity.activityDetails.referenceId;
    let activityName = nameByHash.get(activityHash);
    if (activityName === undefined) {
      activityName = await resolveName(activityHash);
      nameByHash.set(activityHash, activityName);
    }
    const result = await importer({
      viewerUserId: userId,
      viewerMembershipId: account.membership_id,
      rawPgcr,
      activityName,
      db,
    });
    if (result.imported) importedMatches++;
  }

  const characterFinished = reachedCutoff || activities.length < HISTORY_PAGE_SIZE;
  const nextCharacterIndex = characterFinished ? characterIndex + 1 : characterIndex;
  const allFinished = nextCharacterIndex >= characterIds.length;
  const now = new Date().toISOString();
  const patch = allFinished
    ? {
        status: "complete",
        next_page: 0,
        active_character_index: 0,
        backfill_completed_at: syncState.backfill_completed_at ?? now,
        last_incremental_sync_at: now,
        locked_by: null,
        locked_until: null,
        last_error: null,
        attempts: 0,
        updated_at: now,
      }
    : {
        status: "queued",
        next_page: characterFinished ? 0 : page + 1,
        active_character_index: nextCharacterIndex,
        locked_by: null,
        locked_until: null,
        last_error: null,
        attempts: 0,
        updated_at: now,
      };
  const { error: updateError } = await db.from("crucible_sync_state").update(patch).eq("user_id", userId);
  if (updateError) throw new Error(`Sync cursor save failed: ${updateError.message}`);

  return {
    processedActivities: uniqueActivities.length,
    importedMatches,
    hasMore: !allFinished,
  };
}

export async function claimCrucibleSync(
  workerId: string,
  lockSeconds = 55,
  db: Db = adminSupabase,
): Promise<CrucibleSyncState | null> {
  const { data, error } = await db.rpc("claim_crucible_sync", {
    p_worker_id: workerId,
    p_lock_seconds: lockSeconds,
  });
  if (error) throw new Error(`claim_crucible_sync failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.user_id ? row as CrucibleSyncState : null;
}

export async function failCrucibleSync(userId: string, error: unknown, db: Db = adminSupabase) {
  const { data: state } = await db.from("crucible_sync_state").select("attempts").eq("user_id", userId).single();
  const terminal = (state?.attempts ?? 0) >= 5;
  await db.from("crucible_sync_state").update({
    status: terminal ? "failed" : "queued",
    locked_by: null,
    locked_until: null,
    last_error: errorMessage(error),
    requested_at: new Date(Date.now() + Math.min((state?.attempts ?? 1) * 60_000, 15 * 60_000)).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
}

export type { CrucibleActivityHistoryEntry };

