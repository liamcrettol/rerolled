// One-time (but safely repeatable) historical backfill: uploads every
// pre-existing pgcr_cache.raw_pgcr payload to Appwrite Storage, verifies each
// upload by downloading it back and comparing checksums, and stamps
// appwrite_sha256/appwrite_bytes/appwrite_migrated_at/appwrite_last_verified_at
// only once verification passes. See docs/pgcr-archive.md for the full
// rollout order this script fits into.
//
// This script NEVER clears raw_pgcr. Nulling verified payloads is a
// separate, explicitly-flagged, separately-approved step - see
// scripts/reconcile-pgcr-archive.mjs's --clear-verified.
//
// Requires, in .env.local (or the shell env):
//   DATABASE_URL       - Supabase Session pooler connection string (same as db-query.mjs)
//   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_PGCR_BUCKET_ID
//
// Usage:
//   node scripts/migrate-pgcr-to-appwrite.mjs --dry-run
//   node scripts/migrate-pgcr-to-appwrite.mjs
//   node scripts/migrate-pgcr-to-appwrite.mjs --batch 200 --concurrency 4 --limit 5000
//   node scripts/migrate-pgcr-to-appwrite.mjs --verify-only
//   node scripts/migrate-pgcr-to-appwrite.mjs --after 4611686018429999999
//
// Never prints connection strings, API keys, or PGCR payload contents - only
// instance IDs, byte counts, hashes, and error classes.

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { appendFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import {
  loadDotEnvLocal,
  putRawPgcrBytes,
  verifyRawPgcr,
  markArchivedIfCurrent,
  PgcrArchiveError,
} from "./lib/pgcrArchiveCore.mjs";
import { CliArgumentError, parseStrictArgs } from "./lib/strictArgs.mjs";
import { verifyMigratedRow } from "./lib/verifyMigratedRow.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
loadDotEnvLocal(repoRoot);

function parseArgs(argv) {
  return parseStrictArgs(
    argv,
    {
      "--dry-run": { key: "dryRun", type: "boolean" },
      "--verify-only": { key: "verifyOnly", type: "boolean" },
      "--batch": { key: "batch", type: "positiveInteger" },
      "--concurrency": { key: "concurrency", type: "positiveInteger" },
      "--limit": { key: "limit", type: "positiveInteger" },
      "--after": { key: "after", type: "nonEmptyString" },
    },
    { dryRun: false, batch: 200, concurrency: 4, limit: null, verifyOnly: false, after: null },
  );
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  const message = err instanceof CliArgumentError ? err.message : String(err);
  console.error(`Invalid arguments: ${message}`);
  process.exit(2);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL in .env.local. Get your own connection string from " +
      "Supabase Dashboard -> Project Settings -> Database -> Connection string " +
      "(Session pooler tab) and add it as DATABASE_URL=... to .env.local.",
  );
  process.exit(1);
}

const failureLogPath = `${repoRoot}/pgcr-migration-failures.jsonl`;

async function processConcurrently(items, limit, worker) {
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

async function fetchBatch(client, cursor, batchSize, verifyOnly) {
  const whereClause = verifyOnly
    ? "appwrite_migrated_at is not null"
    : "raw_pgcr is not null and appwrite_migrated_at is null";
  const { rows } = await client.query(
    `select instance_id, raw_pgcr::text as payload, appwrite_sha256
     from pgcr_cache
     where ${whereClause} and instance_id > $1
     order by instance_id
     limit $2`,
    [cursor, batchSize],
  );
  return rows;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const counts = { inspected: 0, uploaded: 0, alreadyPresent: 0, verified: 0, conflicts: 0, failed: 0, bytesUploaded: 0 };
  const failures = [];
  const startedAt = Date.now();
  let cursor = args.after ?? "";

  writeFileSync(failureLogPath, ""); // truncate/create fresh for this run

  try {
    for (;;) {
      const remaining = args.limit != null ? args.limit - counts.inspected : null;
      if (remaining != null && remaining <= 0) break;
      const batchSize = remaining != null ? Math.min(args.batch, remaining) : args.batch;

      const rows = await fetchBatch(client, cursor, batchSize, args.verifyOnly);
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].instance_id;

      await processConcurrently(rows, args.concurrency, async (row) => {
        counts.inspected++;
        const instanceId = row.instance_id;
        try {
          if (args.verifyOnly) {
            if (args.dryRun) return;
            const result = await verifyMigratedRow(client, row, { verifyRawPgcr, markArchivedIfCurrent });
            if (!result.ok) {
              counts.failed++;
              failures.push({ instanceId, errorClass: result.errorClass });
              appendFileSync(failureLogPath, `${JSON.stringify({ instanceId, errorClass: result.errorClass })}\n`);
              return;
            }
            counts.verified++;
            return;
          }

          const bytes = Buffer.from(row.payload, "utf8");
          if (args.dryRun) {
            counts.bytesUploaded += bytes.byteLength;
            return;
          }

          const putResult = await putRawPgcrBytes(instanceId, bytes);
          if (putResult.outcome === "already_present") counts.alreadyPresent++;
          else counts.uploaded++;

          const verify = await verifyRawPgcr(instanceId, putResult.sha256);
          if (!verify.ok) {
            counts.failed++;
            failures.push({ instanceId, errorClass: "post_upload_verify_failed" });
            appendFileSync(failureLogPath, `${JSON.stringify({ instanceId, errorClass: "post_upload_verify_failed" })}\n`);
            return;
          }

          // Atomic, checksum-guarded stamp - never clears raw_pgcr (p_clear_raw
          // = false). A false return means raw_pgcr changed concurrently since
          // we read it; this row must NOT be reported as migrated.
          const marked = await markArchivedIfCurrent(client, instanceId, putResult.sha256, false);
          if (!marked) {
            counts.failed++;
            failures.push({ instanceId, errorClass: "guard_rejected_concurrent_write" });
            appendFileSync(failureLogPath, `${JSON.stringify({ instanceId, errorClass: "guard_rejected_concurrent_write" })}\n`);
            return;
          }

          counts.verified++;
          counts.bytesUploaded += putResult.bytes;
        } catch (err) {
          const errorClass = err instanceof PgcrArchiveError ? err.kind : "unknown";
          if (errorClass === "conflict") counts.conflicts++;
          else counts.failed++;
          failures.push({ instanceId, errorClass });
          appendFileSync(failureLogPath, `${JSON.stringify({ instanceId, errorClass })}\n`);
        }
      });

      console.log(
        `  ...inspected=${counts.inspected} uploaded=${counts.uploaded} alreadyPresent=${counts.alreadyPresent} ` +
          `verified=${counts.verified} conflicts=${counts.conflicts} failed=${counts.failed}`,
      );
      if (rows.length < batchSize) break; // last page
    }
  } finally {
    await client.end();
  }

  const elapsedMs = Date.now() - startedAt;
  console.log("\n=== PGCR Appwrite migration summary ===");
  console.log(JSON.stringify({ ...counts, elapsedMs, dryRun: args.dryRun, verifyOnly: args.verifyOnly }, null, 2));
  if (failures.length > 0) {
    console.log(`\n${failures.length} row(s) failed or conflicted - see ${failureLogPath}`);
  }
  process.exit(counts.failed > 0 || counts.conflicts > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Migration run failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
