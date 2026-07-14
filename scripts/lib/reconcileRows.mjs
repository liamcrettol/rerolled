// Pure(ish) row-fetch/row-process logic for scripts/reconcile-pgcr-archive.mjs,
// factored out so it can be unit-tested with a fake pg client and mocked
// Appwrite calls (see __tests__/scripts/reconcileRows.test.ts) without any
// of the CLI script's argv parsing, file-system logging, or process.exit()
// side effects. scripts/migrate-pgcr-to-appwrite.mjs's archive step follows
// the same shape inline (it also calls markArchivedIfCurrent directly).
//
// ARCHIVE and CLEAR are deliberately separate query/processing pairs over
// DISJOINT row sets - see docs/pgcr-archive.md's "Separate archive and clear
// selection". A row moves from the archive queue to the clear queue the
// moment archiving succeeds; historical rows archived by an earlier script
// run are immediately visible to the clear queue, not excluded from it.

import {
  putRawPgcrBytes,
  getRawPgcrBytes,
  verifyRawPgcr,
  sha256Of,
  markArchivedIfCurrent,
  PgcrArchiveError,
} from "./pgcrArchiveCore.mjs";

/** @typedef {{ dryRun?: boolean, onFailure?: (instanceId: string, errorClass: string) => void }} ProcessOptions */

// --- ARCHIVE: rows never yet verified in Appwrite -------------------------

/** @returns {Promise<any[]>} */
export async function fetchArchivePage(client, cursor, pageSize) {
  const { rows } = await client.query(
    `select instance_id, raw_pgcr::text as payload
     from pgcr_cache
     where raw_pgcr is not null and appwrite_migrated_at is null and instance_id > $1
     order by instance_id
     limit $2`,
    [cursor, pageSize],
  );
  return rows;
}

/**
 * @param {any} client
 * @param {any} row
 * @param {ProcessOptions} [options]
 * @returns {Promise<Record<string, number>>}
 */
export async function processArchiveRow(client, row, { dryRun = false, onFailure } = {}) {
  const instanceId = row.instance_id;
  const bytes = Buffer.from(row.payload, "utf8");

  if (dryRun) return { bytesInspected: bytes.byteLength };

  try {
    const putResult = await putRawPgcrBytes(instanceId, bytes);
    const uploadDelta = putResult.outcome === "uploaded" ? { uploaded: 1 } : { alreadyPresent: 1 };

    const verify = await verifyRawPgcr(instanceId, putResult.sha256);
    if (!verify.ok) {
      onFailure?.(instanceId, "post_upload_verify_failed");
      return { failed: 1, ...uploadDelta };
    }

    // Atomic, checksum-guarded stamp - never clears raw_pgcr here
    // (p_clear_raw = false). false means raw_pgcr changed concurrently
    // since we read it; this row must NOT be reported as archived.
    const marked = await markArchivedIfCurrent(client, instanceId, putResult.sha256, false);
    if (!marked) {
      onFailure?.(instanceId, "guard_rejected_concurrent_write");
      return { failed: 1, ...uploadDelta };
    }

    return { verified: 1, bytesUploaded: putResult.bytes, ...uploadDelta };
  } catch (err) {
    const errorClass = err instanceof PgcrArchiveError ? err.kind : "unknown";
    onFailure?.(instanceId, errorClass);
    return errorClass === "conflict" ? { conflicts: 1 } : { failed: 1 };
  }
}

// --- CLEAR: rows already verified in Appwrite, still holding raw_pgcr ----

/** @returns {Promise<any[]>} */
export async function fetchClearPage(client, cursor, pageSize) {
  const { rows } = await client.query(
    `select instance_id, appwrite_sha256, raw_pgcr::text as supabase_text
     from pgcr_cache
     where raw_pgcr is not null
       and appwrite_migrated_at is not null
       and appwrite_sha256 is not null
       and instance_id > $1
     order by instance_id
     limit $2`,
    [cursor, pageSize],
  );
  return rows;
}

/**
 * @param {any} client
 * @param {any} row
 * @param {ProcessOptions} [options]
 * @returns {Promise<Record<string, number>>}
 */
export async function processClearRow(client, row, { dryRun = false, onFailure } = {}) {
  const instanceId = row.instance_id;

  if (dryRun) return { eligibleForClear: 1 };

  try {
    // Re-download the Appwrite object fresh - never trust the stored
    // metadata alone as proof the object still matches.
    const archivedBytes = await getRawPgcrBytes(instanceId);
    if (archivedBytes === null) {
      onFailure?.(instanceId, "integrity_appwrite_object_missing");
      return { failed: 1 };
    }
    const archivedSha256 = sha256Of(archivedBytes);
    if (archivedSha256 !== row.appwrite_sha256) {
      onFailure?.(instanceId, "integrity_appwrite_checksum_mismatch");
      return { failed: 1 };
    }

    // Independently verify the CURRENT Supabase payload also still hashes to
    // the same value - if a concurrent write changed raw_pgcr since it was
    // archived, this catches it before ever attempting the clear.
    const supabaseSha256 = sha256Of(Buffer.from(row.supabase_text, "utf8"));
    if (supabaseSha256 !== row.appwrite_sha256) {
      onFailure?.(instanceId, "supabase_payload_drifted_since_archive");
      return { failed: 1 };
    }

    const cleared = await markArchivedIfCurrent(client, instanceId, archivedSha256, true);
    if (!cleared) {
      onFailure?.(instanceId, "guard_rejected_concurrent_write");
      return { failed: 1 };
    }
    return { cleared: 1 };
  } catch (err) {
    const errorClass = err instanceof PgcrArchiveError ? err.kind : "unknown";
    onFailure?.(instanceId, errorClass);
    return { failed: 1 };
  }
}
