import { adminSupabase } from "@/lib/supabase/admin";
import * as archive from "./archive";
import { PgcrArchiveError } from "./archive";

// Central PGCR persistence/read service. lib/bungie/pgcr.ts and any other
// raw-PGCR access path should go through this module instead of talking to
// Supabase and Appwrite separately - see docs/pgcr-archive.md for the full
// design and rollout order. normalized_pgcr is untouched by this module; it
// is not durable H2H source data the way raw_pgcr is, and stays a plain
// Supabase read everywhere it's used today.
//
// Feature flags (all default OFF - see docs/pgcr-archive.md for rollout order):
//   PGCR_ARCHIVE_READS=1          try Appwrite before falling back to Supabase
//   PGCR_ARCHIVE_WRITES=1         archive new writes to Appwrite (awaited)
//   PGCR_ARCHIVE_CLEAR_VERIFIED=1 null raw_pgcr once a write is verified in Appwrite

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function flagEnabled(name: string): boolean {
  return process.env[name] === "1";
}

export function archiveReadsEnabled(): boolean {
  return flagEnabled("PGCR_ARCHIVE_READS");
}

export function archiveWritesEnabled(): boolean {
  return flagEnabled("PGCR_ARCHIVE_WRITES");
}

export function clearVerifiedEnabled(): boolean {
  return flagEnabled("PGCR_ARCHIVE_CLEAR_VERIFIED");
}

export type PgcrReadResult =
  | { status: "found"; raw: unknown; source: "appwrite" | "supabase" }
  | { status: "not_found" }
  | { status: "error"; retryable: boolean; kind: "integrity" | "unavailable"; message: string };

async function readFromSupabaseOnly(instanceId: string, db: Db): Promise<PgcrReadResult> {
  const { data, error } = await db.from("pgcr_cache").select("raw_pgcr").eq("instance_id", instanceId).maybeSingle();
  if (error) {
    return {
      status: "error",
      retryable: true,
      kind: "unavailable",
      message: `Supabase read failed: ${error.message ?? error}`,
    };
  }
  if (data?.raw_pgcr != null) return { status: "found", raw: data.raw_pgcr, source: "supabase" };
  return { status: "not_found" };
}

/**
 * Read lifecycle (PGCR_ARCHIVE_READS=1):
 *  1. Read Supabase's raw/verification state.
 *  2. If the row is not stamped as verified, return its authoritative
 *     Supabase payload without consulting a potentially orphaned Appwrite
 *     object.
 *  3. For a verified row, prefer Appwrite and fall back to retained raw_pgcr
 *     on a 404 or transient error.
 *  4. If a verified Appwrite object is missing after raw_pgcr was cleared,
 *     return a retryable integrity error rather than a false cache miss.
 *
 * This function never writes anything. Opportunistic backfill of a
 * Supabase-only hit is intentionally NOT triggered inline here (see
 * docs/pgcr-archive.md) - reconciliation is the reliable path for that, so a
 * read never depends on an unawaited write for durability.
 */
export async function readRawPgcr(instanceId: string, db: Db = adminSupabase): Promise<PgcrReadResult> {
  if (!archiveReadsEnabled()) {
    return readFromSupabaseOnly(instanceId, db);
  }

  // A successfully uploaded but not-yet-stamped object is not authoritative:
  // the metadata guard may have rejected it because raw_pgcr changed while
  // the upload was in flight. Read the row state first and only prefer
  // Appwrite when Postgres says this exact row has a verified archive copy.
  // persistRawPgcr clears these metadata columns on every new raw write, so a
  // stale/orphaned object can never shadow a newer Supabase payload.
  const { data, error } = await db
    .from("pgcr_cache")
    .select("raw_pgcr, appwrite_migrated_at, appwrite_sha256")
    .eq("instance_id", instanceId)
    .maybeSingle();

  if (error) {
    return {
      status: "error",
      retryable: true,
      kind: "unavailable",
      message: `Supabase read failed: ${error.message ?? error}`,
    };
  }

  if (!data) return { status: "not_found" };

  const hasRaw = data.raw_pgcr != null;
  const hasVerifiedArchive = Boolean(data.appwrite_migrated_at && data.appwrite_sha256);

  if (!hasVerifiedArchive) {
    if (hasRaw) return { status: "found", raw: data.raw_pgcr, source: "supabase" };

    if (data.appwrite_migrated_at || data.appwrite_sha256) {
      const message = `INTEGRITY: PGCR ${instanceId} has incomplete Appwrite verification metadata and no Supabase raw_pgcr`;
      console.error(`[pgcr-archive] ${message}`);
      return { status: "error", retryable: true, kind: "integrity", message };
    }

    return { status: "not_found" };
  }

  let appwriteMiss: "not_found" | "error";
  try {
    const raw = await archive.getRawPgcr(instanceId);
    if (raw !== null) return { status: "found", raw, source: "appwrite" };
    appwriteMiss = "not_found";
  } catch (err) {
    appwriteMiss = "error";
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[pgcr-archive] Appwrite read failed for ${instanceId}, falling back to Supabase: ${message}`);
  }

  if (hasRaw) {
    if (appwriteMiss === "not_found") {
      console.error(
        `[pgcr-archive] INTEGRITY: ${instanceId} is marked verified but the Appwrite object returned 404; using retained Supabase copy`,
      );
    }
    return { status: "found", raw: data.raw_pgcr, source: "supabase" };
  }

  if (appwriteMiss === "not_found") {
    const message = `INTEGRITY: PGCR ${instanceId} is marked verified in Appwrite, its raw_pgcr was cleared, and the archived object is missing`;
    console.error(`[pgcr-archive] ${message}`);
    return { status: "error", retryable: true, kind: "integrity", message };
  }

  if (appwriteMiss === "error") {
    // Neither side confirmed absence: Appwrite errored (not a clean 404) and
    // Supabase has no payload. Could be a legitimately cleared+verified row,
    // or a transient blip racing a write - treat as retryable, not a
    // permanent miss, so callers don't mistake "currently unavailable" for
    // "does not exist".
    return {
      status: "error",
      retryable: true,
      kind: "unavailable",
      message: `Appwrite unavailable and Supabase has no raw_pgcr for ${instanceId}`,
    };
  }

  return { status: "not_found" };
}

export interface PersistOutcome {
  supabaseWritten: boolean;
  archived: boolean;
  cleared: boolean;
  sha256?: string;
  bytes?: number;
  archiveError?: { kind: string; message: string };
}

export interface PersistOptions {
  db?: Db;
  /** Extra columns merged into the pgcr_cache upsert (e.g. status, source, fetched_at). */
  extraFields?: Record<string, unknown>;
  onConflict?: string;
}

/**
 * Convert an arbitrary caller value into a stable JSON object before any DB
 * call. Supabase's jsonb serializer cannot represent null/undefined roots,
 * arrays-as-PGCRs, BigInt, circular references, or values whose toJSON()
 * produces a scalar. Rejecting those up front avoids writing a malformed
 * durable copy and only discovering the problem during archival.
 */
function validateAndCanonicalizeRawPgcr(rawPgcr: unknown): Record<string, unknown> {
  if (rawPgcr === null || typeof rawPgcr !== "object" || Array.isArray(rawPgcr)) {
    throw new TypeError("raw PGCR must be a non-null JSON object");
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(rawPgcr);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new TypeError(`raw PGCR is not JSON-serializable: ${reason}`);
  }

  if (serialized === undefined) {
    throw new TypeError("raw PGCR is not JSON-serializable");
  }

  const canonical = JSON.parse(serialized) as unknown;
  if (canonical === null || typeof canonical !== "object" || Array.isArray(canonical)) {
    throw new TypeError("raw PGCR must serialize to a JSON object");
  }
  return canonical as Record<string, unknown>;
}

/**
 * Write lifecycle:
 *  1. Upsert raw_pgcr into Supabase first - this is the durable pending/
 *     outbox copy, and always happens regardless of feature flags.
 *  2-3. If PGCR_ARCHIVE_WRITES=1, await the Appwrite upload and download it
 *     back to checksum-verify it.
 *  4-5. Stamp the appwrite_* metadata columns, and (if
 *     PGCR_ARCHIVE_CLEAR_VERIFIED=1) null raw_pgcr, in ONE atomic call to
 *     migration 058's mark_pgcr_archived_if_current RPC. That function
 *     recomputes the checksum of the row's CURRENT raw_pgcr inside the same
 *     guarded UPDATE and only touches the row if it still matches what was
 *     just verified - so a concurrent rewrite between our read/verify and
 *     this call can never cause metadata (or a clear) to be stamped onto the
 *     wrong payload. If the RPC reports no row updated, the guard rejected
 *     the write and this function does NOT report archived/cleared - the row
 *     is left for the next reconciliation sweep to pick up with its new
 *     content.
 *  A failed archive attempt (upload/verify/RPC) leaves raw_pgcr exactly as
 *  written in step 1 - untouched - so the reconciliation sweep can retry; it
 *  never reports archived:true unless the RPC actually confirmed the write.
 *
 * Runs on Vercel: this function AWAITS the Appwrite round-trip inline rather
 * than firing it off in the background, because a serverless invocation may
 * freeze work after the response is sent - nothing durable can depend on an
 * unawaited promise. Callers that cannot afford this latency on a
 * user-facing path should simply leave PGCR_ARCHIVE_WRITES disabled and rely
 * on the reconciliation sweep to archive rows written elsewhere.
 */
export async function persistRawPgcr(
  instanceId: string,
  rawPgcr: unknown,
  options: PersistOptions = {},
): Promise<PersistOutcome> {
  // Validate before even constructing a query builder: malformed input must
  // never result in a partial/outbox write.
  const canonicalRawPgcr = validateAndCanonicalizeRawPgcr(rawPgcr);
  const db = options.db ?? adminSupabase;
  const row = {
    ...options.extraFields,
    instance_id: instanceId,
    raw_pgcr: canonicalRawPgcr,
    // A new raw write invalidates any prior archive assertion. These fields
    // are deliberately after extraFields so callers cannot preserve or forge
    // stale verification metadata. The guarded RPC restores them only after
    // the current Postgres bytes have been uploaded and verified.
    appwrite_sha256: null,
    appwrite_bytes: null,
    appwrite_migrated_at: null,
    appwrite_last_verified_at: null,
  };

  const { error: upsertError } = await db.from("pgcr_cache").upsert(row, { onConflict: options.onConflict ?? "instance_id" });
  if (upsertError) {
    throw new Error(`pgcr_cache upsert failed for ${instanceId}: ${upsertError.message ?? upsertError}`);
  }

  if (!archiveWritesEnabled()) {
    return { supabaseWritten: true, archived: false, cleared: false };
  }

  try {
    // Re-read Postgres's own text rendering of what was just written, rather
    // than re-serializing the JS object. This makes the archived bytes (and
    // their checksum) identical to what scripts/lib/pgcrArchiveCore.mjs
    // computes from raw_pgcr::text for the same row via direct SQL - one
    // definition of "the exact bytes", not two independently-derived ones.
    const { data: textRow, error: textError } = await db
      .from("pgcr_cache")
      .select("raw_pgcr::text")
      .eq("instance_id", instanceId)
      .maybeSingle();
    if (textError || typeof textRow?.raw_pgcr !== "string") {
      throw new Error(`could not re-read raw_pgcr::text after upsert: ${textError?.message ?? "no row returned"}`);
    }

    const bytes = Buffer.from(textRow.raw_pgcr, "utf8");
    const putResult = await archive.putRawPgcrBytes(instanceId, bytes);
    const verify = await archive.verifyRawPgcr(instanceId, putResult.sha256);
    if (!verify.ok) {
      throw new Error(
        `post-upload verification failed for ${instanceId} (expected ${putResult.sha256}, got ${verify.actualSha256 ?? "missing object"})`,
      );
    }

    const shouldClear = clearVerifiedEnabled();
    const { data: marked, error: markError } = await db.rpc("mark_pgcr_archived_if_current", {
      p_instance_id: instanceId,
      p_expected_sha256: putResult.sha256,
      p_clear_raw: shouldClear,
    });
    if (markError) {
      throw new Error(`mark_pgcr_archived_if_current failed for ${instanceId}: ${markError.message ?? markError}`);
    }
    if (marked !== true) {
      // The guard rejected this call: raw_pgcr no longer matches what we
      // just verified (a concurrent write happened in between). Do not
      // report success for either metadata or clearing - the row, now
      // holding different content, is picked up fresh by the next sweep.
      console.warn(`[pgcr-archive] mark_pgcr_archived_if_current rejected ${instanceId} - raw_pgcr changed concurrently`);
      return { supabaseWritten: true, archived: false, cleared: false };
    }

    return { supabaseWritten: true, archived: true, cleared: shouldClear, sha256: putResult.sha256, bytes: putResult.bytes };
  } catch (err) {
    // Never report archived:true when only the Supabase write succeeded.
    // raw_pgcr is left exactly as the upsert above wrote it.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[pgcr-archive] archival failed for ${instanceId}, Supabase copy retained: ${message}`);
    return {
      supabaseWritten: true,
      archived: false,
      cleared: false,
      archiveError: { kind: err instanceof PgcrArchiveError ? err.kind : "unknown", message },
    };
  }
}
