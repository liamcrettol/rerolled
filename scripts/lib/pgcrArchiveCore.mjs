// Shared Appwrite/checksum core for the PGCR archive CLIs
// (scripts/migrate-pgcr-to-appwrite.mjs, scripts/reconcile-pgcr-archive.mjs,
// scripts/verify-pgcr-archive.mjs). This is a plain-JS mirror of
// lib/pgcr/archive.ts's upload/verify logic, kept separate because these
// scripts run standalone via `node` (matching scripts/db-query.mjs's
// convention) rather than through the Next.js/ts-jest toolchain.
//
// Never logs secret values (API keys, connection strings) or PGCR payload
// contents - only instance IDs, sizes, hashes, and error classes.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client, Storage, AppwriteException, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

const DEFAULT_BUCKET_ID = "pgcr-archive";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 4_000;

// a-z, A-Z, 0-9, period, hyphen, underscore; can't start with a special char; max 36 chars.
const VALID_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export function validateInstanceId(instanceId) {
  if (typeof instanceId !== "string" || !VALID_ID_PATTERN.test(instanceId)) {
    throw new PgcrArchiveError(`instance_id "${instanceId}" is not a valid Appwrite file ID`, "invalid_id");
  }
  return instanceId;
}

function validateBucketId(bucketId) {
  if (!VALID_ID_PATTERN.test(bucketId)) {
    throw new PgcrArchiveError("APPWRITE_PGCR_BUCKET_ID is not a valid Appwrite bucket ID", "config", { retryable: false });
  }
  return bucketId;
}

export class PgcrArchiveError extends Error {
  constructor(message, kind, options = {}) {
    super(message);
    this.name = "PgcrArchiveError";
    this.kind = kind;
    this.retryable = options.retryable ?? kind === "transient";
  }
}

export function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}.`);
    process.exit(1);
  }
  return value;
}

let storage = null;

export function getStorage() {
  if (!storage) {
    const client = new Client()
      .setEndpoint(requiredEnv("APPWRITE_ENDPOINT"))
      .setProject(requiredEnv("APPWRITE_PROJECT_ID"))
      .setKey(requiredEnv("APPWRITE_API_KEY"));
    storage = new Storage(client);
  }
  return storage;
}

export function getBucketId() {
  return validateBucketId(process.env.APPWRITE_PGCR_BUCKET_ID?.trim() || DEFAULT_BUCKET_ID);
}

function getEndpoint() {
  const endpoint = requiredEnv("APPWRITE_ENDPOINT").replace(/\/+$/, "");
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    throw new PgcrArchiveError("APPWRITE_ENDPOINT is not a valid HTTP(S) URL", "config", { retryable: false });
  }
  return endpoint;
}

function directDownloadError(status) {
  if (status === 404) return new PgcrArchiveError("not found (404)", "not_found", { retryable: false });
  if (status === 408 || status === 429 || status >= 500) {
    return new PgcrArchiveError(`download transient (${status})`, "transient", { retryable: true });
  }
  return new PgcrArchiveError(`download failed (${status})`, "unknown", { retryable: false });
}

// Do not use node-appwrite's getFileDownload here. v27 eagerly decodes
// application/json responses into objects even though the generated method
// asks for an ArrayBuffer, which changes the exact byte sequence used for
// checksums. Native fetch + arrayBuffer() remains byte-exact for every MIME.
async function downloadExactBytes(instanceId) {
  const bucketId = getBucketId();
  const url = `${getEndpoint()}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(instanceId)}/download`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "X-Appwrite-Project": requiredEnv("APPWRITE_PROJECT_ID"),
      "X-Appwrite-Key": requiredEnv("APPWRITE_API_KEY"),
      Accept: "application/octet-stream",
    },
  });
  if (!response.ok) throw directDownloadError(response.status);
  return Buffer.from(await response.arrayBuffer());
}

function classifyError(err) {
  if (err instanceof PgcrArchiveError) return err;
  if (err instanceof AppwriteException) {
    const code = err.code;
    if (code === 404) return new PgcrArchiveError(`not found (404): ${err.message}`, "not_found", { retryable: false });
    if (code === 409) return new PgcrArchiveError(`conflict (409): ${err.message}`, "conflict", { retryable: false });
    if (code === 429 || code >= 500) return new PgcrArchiveError(`transient (${code}): ${err.message}`, "transient", { retryable: true });
    return new PgcrArchiveError(`error (${code ?? "unknown"}): ${err.message}`, "unknown", { retryable: false });
  }
  return new PgcrArchiveError(`request failed: ${err?.message ?? String(err)}`, "transient", { retryable: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  return Math.random() * Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

async function withRetry(op, opName, quiet) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await op();
    } catch (err) {
      const classified = classifyError(err);
      if (!classified.retryable || attempt === MAX_ATTEMPTS - 1) throw classified;
      lastError = classified;
      const wait = backoffMs(attempt);
      if (!quiet) console.warn(`  [retry] ${opName} attempt ${attempt + 1}/${MAX_ATTEMPTS} (${classified.kind}), waiting ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
  throw lastError ?? new PgcrArchiveError(`${opName} failed with no captured error`, "unknown");
}

/** Downloads raw bytes, or null on a normal 404. */
export async function getRawPgcrBytes(instanceId) {
  validateInstanceId(instanceId);
  try {
    return await withRetry(() => downloadExactBytes(instanceId), "getFileDownload");
  } catch (err) {
    const classified = classifyError(err);
    if (classified.kind === "not_found") return null;
    throw classified;
  }
}

export async function hasRawPgcr(instanceId) {
  validateInstanceId(instanceId);
  try {
    await withRetry(() => getStorage().getFile({ bucketId: getBucketId(), fileId: instanceId }), "getFile", true);
    return true;
  } catch (err) {
    const classified = classifyError(err);
    if (classified.kind === "not_found") return false;
    throw classified;
  }
}

/**
 * Create-only upload with 409-checksum reconciliation, identical contract to
 * lib/pgcr/archive.ts's putRawPgcrBytes: never overwrites, a checksum
 * mismatch on an existing object is a hard conflict thrown to the caller.
 */
export async function putRawPgcrBytes(instanceId, bytes) {
  validateInstanceId(instanceId);
  const sha256 = sha256Of(bytes);

  try {
    await withRetry(
      () => getStorage().createFile({
        bucketId: getBucketId(),
        fileId: instanceId,
        // Appwrite sniffs JSON content regardless of extension. Direct REST
        // downloads preserve the bytes, so retain the truthful filename.
        file: InputFile.fromBuffer(bytes, `${instanceId}.json`),
      }),
      "createFile",
    );
    return { outcome: "uploaded", sha256, bytes: bytes.byteLength };
  } catch (err) {
    const classified = classifyError(err);
    if (classified.kind !== "conflict") throw classified;

    const existing = await getRawPgcrBytes(instanceId);
    if (existing === null) {
      throw new PgcrArchiveError(`${instanceId} reported 409 on create but is unreadable afterward`, "transient", { retryable: true });
    }
    const existingSha256 = sha256Of(existing);
    if (existingSha256 !== sha256) {
      throw new PgcrArchiveError(
        `${instanceId} already exists with a different checksum (expected ${sha256}, found ${existingSha256})`,
        "conflict",
        { retryable: false },
      );
    }
    return { outcome: "already_present", sha256, bytes: existing.byteLength };
  }
}

export async function verifyRawPgcr(instanceId, expectedSha256) {
  const bytes = await getRawPgcrBytes(instanceId);
  if (bytes === null) return { ok: false, actualSha256: null, bytes: null };
  const actualSha256 = sha256Of(bytes);
  return { ok: actualSha256 === expectedSha256, actualSha256, bytes: bytes.byteLength };
}

/**
 * Paginates the bucket's file list via cursor (not the console's displayed
 * total, which the "don't depend solely on the console" requirement calls
 * out specifically) and returns the true object count.
 */
export async function listBucketFileIds() {
  const ids = [];
  let cursor = null;
  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await withRetry(() => getStorage().listFiles({ bucketId: getBucketId(), queries }), "listFiles");
    ids.push(...page.files.map((file) => file.$id));
    if (page.files.length < 100) break;
    const nextCursor = page.files[page.files.length - 1].$id;
    if (!nextCursor || nextCursor === cursor) {
      throw new PgcrArchiveError("Appwrite file-list cursor did not advance", "unknown", { retryable: false });
    }
    cursor = nextCursor;
  }
  return ids;
}

export async function countBucketFiles() {
  return (await listBucketFileIds()).length;
}

/**
 * Calls migration 058's mark_pgcr_archived_if_current RPC - the single
 * atomic, concurrency-safe place that stamps appwrite_* metadata and
 * (optionally) clears raw_pgcr. Returns whether a row was actually updated;
 * false means the guard rejected the call because raw_pgcr no longer
 * matched p_expected_sha256 (a concurrent rewrite happened) - callers MUST
 * treat that as "not archived/cleared", never as success.
 */
export async function markArchivedIfCurrent(pgClient, instanceId, expectedSha256, clearRaw) {
  const { rows } = await pgClient.query(
    "select mark_pgcr_archived_if_current($1, $2, $3) as marked",
    [instanceId, expectedSha256, clearRaw],
  );
  return rows[0]?.marked === true;
}

/** Loads .env.local into process.env (does not override already-set vars), matching scripts/db-query.mjs. */
export function loadDotEnvLocal(repoRoot) {
  const path = `${repoRoot}/.env.local`;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.replace(/\r$/, "").match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}
