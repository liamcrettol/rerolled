import { createHash } from "node:crypto";
import type { Storage, AppwriteException as AppwriteExceptionType } from "node-appwrite";

// Server-only PGCR object storage adapter (same convention as
// lib/supabase/admin.ts: the repo has no "server-only" package, so the
// boundary is enforced by never importing this from a "use client" file or a
// NEXT_PUBLIC_* variable, plus the lazy client below). This is the ONLY
// module in the repo allowed to import "node-appwrite" - everything else
// goes through lib/pgcr/service.ts. See docs/pgcr-archive.md for the full
// rollout plan.
//
// The "node-appwrite" import itself is dynamic (not a top-level import), on
// top of the lazy client construction below: node-appwrite pulls in undici
// at module-load time, which assumes a real Node runtime (it needs globals
// like TextEncoder that jsdom-based test environments don't provide) even
// before any Appwrite call is made. A top-level `import` would break any
// test - or any bundling context - that merely imports this module
// transitively without ever calling it. Only type-only imports are static
// above, which are erased at compile time and never execute.
//
// Appwrite holds the complete raw PGCR JSON as opaque UTF-8 bytes, addressed
// deterministically by Destiny instance_id (no separate file-ID column is
// needed - the mapping is the identity function). Supabase's raw_pgcr column
// remains the durable write-first copy; this adapter never decides on its
// own to delete or overwrite anything - see putRawPgcr below.

const DEFAULT_BUCKET_ID = "pgcr-archive";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 4_000;

export type ArchiveErrorKind =
  | "invalid_id"
  | "not_found"
  | "conflict"
  | "transient"
  | "config"
  | "unknown";

export class PgcrArchiveError extends Error {
  readonly kind: ArchiveErrorKind;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, kind: ArchiveErrorKind, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = "PgcrArchiveError";
    this.kind = kind;
    this.retryable = options.retryable ?? kind === "transient";
    this.cause = options.cause;
  }
}

export interface PutRawPgcrResult {
  /** "uploaded" = new object created; "already_present" = 409 with a matching checksum (idempotent). */
  outcome: "uploaded" | "already_present";
  sha256: string;
  bytes: number;
}

// Appwrite custom-ID rules (server SDK docs): a-z, A-Z, 0-9, period, hyphen,
// underscore; cannot start with a special character; max length 36. Destiny
// instance IDs are numeric strings well under that limit, so this should
// never actually reject a real instance_id - it exists to fail loudly instead
// of silently mis-addressing an object if that assumption is ever wrong.
const VALID_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export function validateInstanceId(instanceId: string): string {
  if (typeof instanceId !== "string" || !VALID_ID_PATTERN.test(instanceId)) {
    throw new PgcrArchiveError(
      `instance_id "${instanceId}" is not a valid Appwrite file ID (a-z, A-Z, 0-9, "._-", 1-36 chars, cannot start with a special char)`,
      "invalid_id",
    );
  }
  return instanceId;
}

function validateBucketId(bucketId: string): string {
  if (!VALID_ID_PATTERN.test(bucketId)) {
    throw new PgcrArchiveError("APPWRITE_PGCR_BUCKET_ID is not a valid Appwrite bucket ID", "config", { retryable: false });
  }
  return bucketId;
}

export function sha256Of(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new PgcrArchiveError(`Missing required environment variable ${name}`, "config", { retryable: false });
  }
  return value;
}

// Lazy client, mirroring lib/supabase/admin.ts's Proxy pattern: env vars are
// only read (and validated) the first time the archive is actually used, so
// importing this module - or anything that imports it - never breaks
// `next build` or a deployment that simply hasn't set APPWRITE_* yet. The
// "node-appwrite" import is itself deferred to this same first-use point -
// see the module-level comment above for why.
let storage: Storage | null = null;
let AppwriteExceptionRef: typeof AppwriteExceptionType | null = null;

async function getStorage(): Promise<Storage> {
  if (!storage) {
    const { Client, Storage: StorageCtor, AppwriteException } = await import("node-appwrite");
    AppwriteExceptionRef = AppwriteException;
    const client = new Client()
      .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
      .setProject(requireEnv("APPWRITE_PROJECT_ID"))
      .setKey(requireEnv("APPWRITE_API_KEY"));
    storage = new StorageCtor(client);
  }
  return storage;
}

function getBucketId(): string {
  return validateBucketId(process.env.APPWRITE_PGCR_BUCKET_ID?.trim() || DEFAULT_BUCKET_ID);
}

function getEndpoint(): string {
  const endpoint = requireEnv("APPWRITE_ENDPOINT").replace(/\/+$/, "");
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    throw new PgcrArchiveError("APPWRITE_ENDPOINT is not a valid HTTP(S) URL", "config", { retryable: false });
  }
  return endpoint;
}

function directDownloadError(status: number): PgcrArchiveError {
  if (status === 404) {
    return new PgcrArchiveError("PGCR object not found (404)", "not_found", { retryable: false });
  }
  if (status === 408 || status === 429 || status >= 500) {
    return new PgcrArchiveError(`Appwrite download transient error (${status})`, "transient", { retryable: true });
  }
  return new PgcrArchiveError(`Appwrite download failed (${status})`, "unknown", { retryable: false });
}

/**
 * Download through the REST endpoint instead of Storage#getFileDownload.
 * node-appwrite v27 content-decodes application/json responses into JS
 * objects even when the generated method requests an ArrayBuffer, destroying
 * whitespace/key-order bytes and therefore their checksum. Native fetch plus
 * response.arrayBuffer() always returns the exact response bytes regardless
 * of the server's MIME type.
 */
async function downloadExactBytes(instanceId: string): Promise<Buffer> {
  const bucketId = getBucketId();
  const url = `${getEndpoint()}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(instanceId)}/download`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "X-Appwrite-Project": requireEnv("APPWRITE_PROJECT_ID"),
      "X-Appwrite-Key": requireEnv("APPWRITE_API_KEY"),
      Accept: "application/octet-stream",
    },
  });

  if (!response.ok) throw directDownloadError(response.status);
  return Buffer.from(await response.arrayBuffer());
}

function isAppwriteException(err: unknown): err is InstanceType<typeof AppwriteExceptionType> {
  return AppwriteExceptionRef !== null && err instanceof AppwriteExceptionRef;
}

function classifyError(err: unknown): PgcrArchiveError {
  if (err instanceof PgcrArchiveError) return err;
  if (isAppwriteException(err)) {
    const code = err.code;
    if (code === 404) return new PgcrArchiveError(`PGCR object not found (404): ${err.message}`, "not_found", { retryable: false, cause: err });
    if (code === 409) return new PgcrArchiveError(`PGCR object already exists (409): ${err.message}`, "conflict", { retryable: false, cause: err });
    if (code === 429 || code >= 500) return new PgcrArchiveError(`Appwrite transient error (${code}): ${err.message}`, "transient", { retryable: true, cause: err });
    return new PgcrArchiveError(`Appwrite error (${code ?? "unknown"}): ${err.message}`, "unknown", { retryable: false, cause: err });
  }
  // Network-level failures (timeouts, DNS, connection reset) surface as plain
  // Error/DOMException, not AppwriteException - treat them as transient.
  const message = err instanceof Error ? err.message : String(err);
  return new PgcrArchiveError(`Appwrite request failed: ${message}`, "transient", { retryable: true, cause: err });
}

// The node-appwrite SDK's AppwriteException does not expose response headers
// (see node_modules/node-appwrite/dist/client.js - Client#call only captures
// status/type/body), so a real Retry-After header is never available through
// this SDK surface. Best-effort: if Appwrite's JSON error body happens to
// carry a numeric retry hint, honor it; otherwise fall back to backoff.
function retryAfterMsFromError(err: PgcrArchiveError): number | null {
  if (!isAppwriteException(err.cause)) return null;
  try {
    const body = JSON.parse(err.cause.response || "{}");
    const seconds = Number(body?.retry ?? body?.retryAfter ?? body?.ThrottleSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.random() * base;
}

async function withRetry<T>(op: () => Promise<T>, opName: string): Promise<T> {
  let lastError: PgcrArchiveError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await op();
    } catch (err) {
      const classified = classifyError(err);
      if (!classified.retryable || attempt === MAX_ATTEMPTS - 1) throw classified;
      lastError = classified;
      const wait = retryAfterMsFromError(classified) ?? backoffMs(attempt);
      console.warn(`[pgcr-archive] ${opName} attempt ${attempt + 1}/${MAX_ATTEMPTS} failed (${classified.kind}), retrying in ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
  // Unreachable given the loop above always returns or throws, but keeps TS happy.
  throw lastError ?? new PgcrArchiveError(`${opName} failed with no captured error`, "unknown");
}

/** Metadata-only existence check - no download. */
export async function hasRawPgcr(instanceId: string): Promise<boolean> {
  validateInstanceId(instanceId);
  try {
    await withRetry(async () => (await getStorage()).getFile({ bucketId: getBucketId(), fileId: instanceId }), "hasRawPgcr");
    return true;
  } catch (err) {
    const classified = classifyError(err);
    if (classified.kind === "not_found") return false;
    throw classified;
  }
}

/** Downloads and returns the raw bytes, or null on a normal 404. */
export async function getRawPgcrBytes(instanceId: string): Promise<Buffer | null> {
  validateInstanceId(instanceId);
  try {
    return await withRetry(() => downloadExactBytes(instanceId), "getRawPgcrBytes");
  } catch (err) {
    const classified = classifyError(err);
    if (classified.kind === "not_found") return null;
    throw classified;
  }
}

/** Downloads and JSON.parses the archived PGCR, or null on a normal 404. Opaque - never mutates the parsed shape. */
export async function getRawPgcr(instanceId: string): Promise<unknown | null> {
  const bytes = await getRawPgcrBytes(instanceId);
  if (bytes === null) return null;
  return JSON.parse(bytes.toString("utf8"));
}

/**
 * Create-only upload. Never overwrites an existing object:
 *  - Normal case: the object doesn't exist yet -> uploaded.
 *  - 409 (already exists): download the existing object and compare hashes.
 *    Matching bytes -> idempotent success ("already_present"). Mismatched
 *    bytes -> hard conflict, thrown, and NEITHER copy is touched. PGCRs are
 *    immutable once a match ends, so a real mismatch means a bug (or a
 *    genuine Bungie data anomaly) worth a human looking at, not something to
 *    silently resolve by picking a winner.
 */
export async function putRawPgcrBytes(instanceId: string, bytes: Buffer): Promise<PutRawPgcrResult> {
  validateInstanceId(instanceId);
  const sha256 = sha256Of(bytes);

  try {
    await withRetry(
      async () => {
        const [storage, { InputFile }] = await Promise.all([getStorage(), import("node-appwrite/file")]);
        return storage.createFile({
          bucketId: getBucketId(),
          fileId: instanceId,
          // Appwrite sniffs JSON content regardless of the filename. Exact
          // download bytes are guaranteed by downloadExactBytes(), so keep the
          // truthful .json filename instead of relying on a MIME workaround.
          file: InputFile.fromBuffer(bytes, `${instanceId}.json`),
        });
      },
      "putRawPgcr:create",
    );
    return { outcome: "uploaded", sha256, bytes: bytes.byteLength };
  } catch (err) {
    const classified = classifyError(err);
    if (classified.kind !== "conflict") throw classified;

    const existing = await getRawPgcrBytes(instanceId);
    if (existing === null) {
      // 409 said it exists, but it's gone by the time we looked - transient
      // window (e.g. a delete we don't perform, or eventual consistency).
      // Surface as transient so the caller's retry/reconciliation loop
      // handles it rather than treating it as a resolved conflict.
      throw new PgcrArchiveError(
        `PGCR ${instanceId} reported 409 on create but is unreadable afterward`,
        "transient",
        { retryable: true },
      );
    }
    const existingSha256 = sha256Of(existing);
    if (existingSha256 !== sha256) {
      throw new PgcrArchiveError(
        `PGCR ${instanceId} already exists in Appwrite with a different checksum (expected ${sha256}, found ${existingSha256}) - refusing to overwrite`,
        "conflict",
        { retryable: false },
      );
    }
    return { outcome: "already_present", sha256, bytes: existing.byteLength };
  }
}

/** Convenience wrapper for callers that have the parsed PGCR object rather than pre-serialized bytes. */
export async function putRawPgcr(instanceId: string, rawPgcr: unknown): Promise<PutRawPgcrResult> {
  return putRawPgcrBytes(instanceId, Buffer.from(JSON.stringify(rawPgcr), "utf8"));
}

export interface VerifyResult {
  ok: boolean;
  actualSha256: string | null;
  bytes: number | null;
}

/** Downloads the archived object and compares its checksum against an expected value. */
export async function verifyRawPgcr(instanceId: string, expectedSha256: string): Promise<VerifyResult> {
  const bytes = await getRawPgcrBytes(instanceId);
  if (bytes === null) return { ok: false, actualSha256: null, bytes: null };
  const actualSha256 = sha256Of(bytes);
  return { ok: actualSha256 === expectedSha256, actualSha256, bytes: bytes.byteLength };
}
