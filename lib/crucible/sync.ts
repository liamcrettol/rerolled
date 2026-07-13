import { adminSupabase } from "@/lib/supabase/admin";
import { isBungieAuthErrorMessage } from "@/lib/auth/bungieErrors";
import { getBungieToken } from "@/lib/auth/helpers";
import { getPGCR, resolveActivity } from "@/lib/bungie/pgcr";
import { parsePgcr } from "@/lib/scoreAttack/pgcr";
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

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

// Bungie throttles per app key, so a handful of concurrent PGCR fetches is the
// sweet spot: past that you buy 429s, not speed (same ceiling detect-games uses).
const PGCR_CONCURRENCY = 4;

async function processConcurrently<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// Resolve an activity's name + map image once per hash, deduping concurrent
// lookups of the same hash by caching the in-flight promise.
function makeActivityResolver(resolveDef: typeof resolveActivity) {
  const cache = new Map<number, ReturnType<typeof resolveActivity>>();
  return (hash: number) => {
    let entry = cache.get(hash);
    if (!entry) {
      entry = resolveDef(hash);
      cache.set(hash, entry);
    }
    return entry;
  };
}

async function resolveMatchDefinitions(
  rawPgcr: unknown,
  mapHash: number,
  resolve: ReturnType<typeof makeActivityResolver>,
) {
  const directorHash = parsePgcr(rawPgcr).directorActivityHash;
  const [activity, directorActivity] = await Promise.all([
    resolve(mapHash),
    directorHash !== null && directorHash !== mapHash ? resolve(directorHash) : Promise.resolve(null),
  ]);
  return { activity, directorActivity };
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

  // Dedupe per viewer, not against the global match table. Another signed-in
  // player may already have imported the same PGCR without creating this
  // viewer's encounter rows.
  const ids = [...candidates.keys()];
  const { data: existingRows, error: existingError } = await db
    .from("crucible_match_viewers")
    .select("instance_id")
    .eq("viewer_user_id", userId)
    .in("instance_id", ids);
  if (existingError) throw new Error(`Viewer match lookup failed: ${existingError.message}`);
  const existing = new Set((existingRows ?? []).map((row: { instance_id: string }) => row.instance_id));

  let imported = 0;
  const resolve = makeActivityResolver(resolveDef);
  const toImport = [...candidates.values()].filter((a) => !existing.has(a.activityDetails.instanceId));
  await processConcurrently(toImport, PGCR_CONCURRENCY, async (activity) => {
    const rawPgcr = await getPgcr(activity.activityDetails.instanceId);
    if (!rawPgcr) return;
    const { activity: def, directorActivity } = await resolveMatchDefinitions(
      rawPgcr,
      activity.activityDetails.referenceId,
      resolve,
    );
    const result = await importer({
      viewerUserId: userId,
      viewerMembershipId: account.membership_id,
      rawPgcr,
      activityName: def.name,
      activityImage: def.image,
      activityDefModes: def.modes,
      directorActivityName: directorActivity?.name ?? null,
      directorActivityDefModes: directorActivity?.modes ?? [],
      db,
    });
    if (result.imported) imported++;
  });

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
  const resolve = makeActivityResolver(resolveDef);
  await processConcurrently(uniqueActivities, PGCR_CONCURRENCY, async (activity) => {
    // The backfill cursor advances past this whole page below, so a throttled
    // PGCR fetch must fail the page (retried later with backoff) rather than
    // silently skip the match forever. A genuinely missing PGCR still skips.
    const rawPgcr = await getPgcr(activity.activityDetails.instanceId, { throwOnTransient: true });
    if (!rawPgcr) return;
    const { activity: def, directorActivity } = await resolveMatchDefinitions(
      rawPgcr,
      activity.activityDetails.referenceId,
      resolve,
    );
    const result = await importer({
      viewerUserId: userId,
      viewerMembershipId: account.membership_id,
      rawPgcr,
      activityName: def.name,
      activityImage: def.image,
      activityDefModes: def.modes,
      directorActivityName: directorActivity?.name ?? null,
      directorActivityDefModes: directorActivity?.modes ?? [],
      db,
    });
    if (result.imported) importedMatches++;
  });

  const characterFinished = reachedCutoff || activities.length < HISTORY_PAGE_SIZE;
  const nextCharacterIndex = characterFinished ? characterIndex + 1 : characterIndex;
  const allFinished = nextCharacterIndex >= characterIds.length;
  const now = new Date().toISOString();
  const cycleStartedAt = syncState.sync_started_at ?? now;
  const patch = allFinished
    ? {
        status: "complete",
        next_page: 0,
        active_character_index: 0,
        backfill_completed_at: syncState.backfill_completed_at ?? now,
        last_incremental_sync_at: cycleStartedAt,
        sync_started_at: null,
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

// Claim the next queued (or lock-expired) sync-state row for the background
// backfill worker, atomically marking it in-progress. Returns null when the
// queue is empty.
export async function claimCrucibleSync(
  workerId: string,
  lockSeconds = 90,
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

// Record a per-user backfill failure without failing the whole cron run.
// Transient failures retry with backoff up to a few times, then park the user
// as failed. Auth failures (dead or cross-app refresh token) are deterministic:
// no retry ever fixes them, only the user signing in again, so park immediately
// instead of burning the retry budget one alert at a time. Returns whether the
// user was terminally parked (vs. requeued for retry) so the cron can report
// only parks as failures instead of reddening the run for a self-healing blip.
export async function failCrucibleSync(
  userId: string,
  error: unknown,
  db: Db = adminSupabase,
): Promise<{ terminal: boolean }> {
  const message = errorMessage(error);
  const { data: state, error: stateError } = await db.from("crucible_sync_state").select("attempts").eq("user_id", userId).single();
  if (stateError || !state) throw new Error(`Sync failure state read failed: ${stateError?.message ?? "missing"}`);
  const terminal = isBungieAuthErrorMessage(message) || (state?.attempts ?? 0) >= 5;
  const { error: updateError } = await db.from("crucible_sync_state").update({
    status: terminal ? "failed" : "queued",
    locked_by: null,
    locked_until: null,
    last_error: message,
    requested_at: new Date(Date.now() + Math.min((state?.attempts ?? 1) * 60_000, 15 * 60_000)).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (updateError) throw new Error(`Sync failure state update failed: ${updateError.message}`);
  return { terminal };
}

export interface ParkedCrucibleSync {
  userId: string;
  displayName: string | null;
  error: string | null;
  parkedAt: string | null;
}

// Every currently-parked user (status "failed"), not just users parked during
// the current run. Parked users drop out of the due queue entirely, so later
// runs report green while those users' history silently stops syncing; that is
// how the July 10 cross-app parking went unnoticed for days. The cron includes
// this list in every run summary so parked users stay visible until they sign
// in again (#343).
export async function listParkedCrucibleSyncs(db: Db = adminSupabase): Promise<ParkedCrucibleSync[]> {
  const { data: rows, error } = await db
    .from("crucible_sync_state")
    .select("user_id, last_error, updated_at")
    .eq("status", "failed");
  if (error) throw new Error(`Parked sync lookup failed: ${error.message}`);

  const parked = (rows ?? []) as Array<{ user_id: string; last_error: string | null; updated_at: string | null }>;
  if (parked.length === 0) return [];

  // Names are a nicety for the run summary; the ids already identify the users.
  const names = new Map<string, string | null>();
  try {
    const { data: userRows } = await db
      .from("users")
      .select("id, display_name")
      .in("id", parked.map((row) => row.user_id));
    for (const row of (userRows ?? []) as Array<{ id: string; display_name: string | null }>) {
      names.set(row.id, row.display_name);
    }
  } catch {
    // ignore; fall back to ids
  }

  return parked.map((row) => ({
    userId: row.user_id,
    displayName: names.get(row.user_id) ?? null,
    error: row.last_error,
    parkedAt: row.updated_at,
  }));
}

export type { CrucibleActivityHistoryEntry };

