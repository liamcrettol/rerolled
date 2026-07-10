import { adminSupabase } from "@/lib/supabase/admin";
import { getBungieToken } from "@/lib/auth/helpers";
import { getPGCR, resolveActivity } from "@/lib/bungie/pgcr";
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
  resolveActivityDef?: typeof resolveActivity;
  importMatch?: typeof importCrucibleMatch;
}

function parseCharacterIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

// On-view sync: pull just the newest page of Crucible activity for the viewer
// and import anything we have not seen yet, so recent matches appear the moment
// they open the dashboard instead of waiting for the backfill cron. This never
// advances the backfill cutoff (that stays the cron's job so deep history is
// walked contiguously with no gaps); it is a cheap, idempotent top-up. In steady
// state it is one activity-page fetch plus zero PGCR fetches.
export async function syncRecentCrucibleHistory(
  userId: string,
  dependencies: SyncDependencies = {},
): Promise<{ imported: number }> {
  const db = dependencies.db ?? adminSupabase;
  const getToken = dependencies.getToken ?? getBungieToken;
  const getCharacters = dependencies.getCharacters ?? getDestinyCharacterIds;
  const getHistoryPage = dependencies.getHistoryPage ?? getCrucibleActivityPage;
  const getPgcr = dependencies.getPgcr ?? getPGCR;
  const resolveDef = dependencies.resolveActivityDef ?? resolveActivity;
  const importer = dependencies.importMatch ?? importCrucibleMatch;

  const [{ data: account }, { data: stateRow }] = await Promise.all([
    db.from("bungie_accounts").select("membership_id, membership_type").eq("user_id", userId).maybeSingle(),
    db.from("crucible_sync_state").select("character_ids, last_incremental_sync_at, backfill_completed_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (!account) return { imported: 0 };
  const state = stateRow as Pick<CrucibleSyncState, "character_ids" | "last_incremental_sync_at" | "backfill_completed_at"> | null;

  const cutoffRaw = state?.last_incremental_sync_at ?? state?.backfill_completed_at ?? null;
  const cutoffMs = cutoffRaw ? new Date(cutoffRaw).getTime() : 0;

  const token = await getToken(userId, account.membership_id);
  let characterIds = parseCharacterIds(state?.character_ids);
  if (characterIds.length === 0) {
    characterIds = await getCharacters(account.membership_type, account.membership_id, token);
  }

  // Gather the newest page for every character, keeping only activities newer
  // than what we have already synced.
  const candidates = new Map<string, CrucibleActivityHistoryEntry>();
  for (const characterId of characterIds) {
    const activities = await getHistoryPage(account.membership_type, account.membership_id, characterId, 0, token);
    for (const activity of activities) {
      if (cutoffMs && new Date(activity.period).getTime() <= cutoffMs) continue;
      candidates.set(activity.activityDetails.instanceId, activity);
    }
  }
  if (candidates.size === 0) return { imported: 0 };

  // Skip anything already imported so a routine page view costs no PGCR fetches.
  const ids = [...candidates.keys()];
  const { data: existingRows } = await db.from("crucible_matches").select("instance_id").in("instance_id", ids);
  const existing = new Set((existingRows ?? []).map((row: { instance_id: string }) => row.instance_id));

  let imported = 0;
  const defByHash = new Map<number, { name: string | null; image: string | null }>();
  for (const [instanceId, activity] of candidates) {
    if (existing.has(instanceId)) continue;
    const rawPgcr = await getPgcr(instanceId);
    if (!rawPgcr) continue;
    const activityHash = activity.activityDetails.referenceId;
    let def = defByHash.get(activityHash);
    if (def === undefined) {
      def = await resolveDef(activityHash);
      defByHash.set(activityHash, def);
    }
    const result = await importer({
      viewerUserId: userId,
      viewerMembershipId: account.membership_id,
      rawPgcr,
      activityName: def.name,
      activityImage: def.image,
      db,
    });
    if (result.imported) imported++;
  }

  return { imported };
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
  const resolveDef = dependencies.resolveActivityDef ?? resolveActivity;
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
  const defByHash = new Map<number, { name: string | null; image: string | null }>();
  for (const activity of uniqueActivities) {
    const rawPgcr = await getPgcr(activity.activityDetails.instanceId);
    if (!rawPgcr) continue;
    const activityHash = activity.activityDetails.referenceId;
    let def = defByHash.get(activityHash);
    if (def === undefined) {
      def = await resolveDef(activityHash);
      defByHash.set(activityHash, def);
    }
    const result = await importer({
      viewerUserId: userId,
      viewerMembershipId: account.membership_id,
      rawPgcr,
      activityName: def.name,
      activityImage: def.image,
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

export type { CrucibleActivityHistoryEntry };

