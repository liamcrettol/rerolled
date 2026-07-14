// Ongoing reconciliation: the permanent replacement for the old
// prune_pgcr_cache() cron call (removed from app/api/cron/sync-crucible in
// this same feature - see migration 057). Runs up to two INDEPENDENT bounded
// sweeps, each with its own keyset cursor and its own selection criteria -
// see docs/pgcr-archive.md's "Separate archive and clear selection":
//
//   ARCHIVE sweep (always runs): rows that still hold a raw payload and have
//     never been verified in Appwrite (`appwrite_migrated_at IS NULL`).
//     Uploads, verifies, and stamps metadata. NEVER clears raw_pgcr.
//
//   CLEAR sweep (only with --clear-verified --confirm-clear-verified-payloads):
//     rows that were ALREADY verified in Appwrite in some earlier pass
//     (`appwrite_migrated_at IS NOT NULL AND appwrite_sha256 IS NOT NULL`) -
//     a disjoint set from the archive sweep, so historical rows migrated by
//     scripts/migrate-pgcr-to-appwrite.mjs (or an earlier reconcile run) are
//     reachable here, not invisible to it. Re-downloads the Appwrite object,
//     verifies it against the stored appwrite_sha256, verifies the CURRENT
//     Supabase raw_pgcr also hashes to that same value, and only then clears
//     - via the same atomic, checksum-guarded RPC the archive sweep uses.
//
// Each sweep is bounded and terminates on its own (scripts/lib/reconcileSweep.mjs):
// it walks the table once from its cursor's starting point to the end (or to
// --limit), advancing the cursor after every fetched page regardless of
// whether individual rows in it succeeded or failed. A row that fails
// forever never blocks the rows after it within one run, and an unbounded
// (no --limit) run still terminates once it reaches the end of the table.
// The row-level fetch/process logic lives in scripts/lib/reconcileRows.mjs -
// see __tests__/scripts/reconcileSweep.test.ts and reconcileRows.test.ts.
//
// Requires, in .env.local (or the shell env):
//   DATABASE_URL       - Supabase Session pooler connection string (same as db-query.mjs)
//   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_PGCR_BUCKET_ID
//
// Usage:
//   node scripts/reconcile-pgcr-archive.mjs --dry-run
//   node scripts/reconcile-pgcr-archive.mjs --batch 100 --concurrency 4
//   node scripts/reconcile-pgcr-archive.mjs --limit 500          # bounded sweep, e.g. for a cron invocation
//   node scripts/reconcile-pgcr-archive.mjs --clear-verified --confirm-clear-verified-payloads
//
// Never prints connection strings, API keys, or PGCR payload contents.

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { appendFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { loadDotEnvLocal } from "./lib/pgcrArchiveCore.mjs";
import { runSweep } from "./lib/reconcileSweep.mjs";
import { fetchArchivePage, processArchiveRow, fetchClearPage, processClearRow } from "./lib/reconcileRows.mjs";
import { CliArgumentError, parseStrictArgs } from "./lib/strictArgs.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
loadDotEnvLocal(repoRoot);

function parseArgs(argv) {
  return parseStrictArgs(
    argv,
    {
      "--dry-run": { key: "dryRun", type: "boolean" },
      "--batch": { key: "batch", type: "positiveInteger" },
      "--concurrency": { key: "concurrency", type: "positiveInteger" },
      "--limit": { key: "limit", type: "positiveInteger" },
      "--clear-verified": { key: "clearVerified", type: "boolean" },
      "--confirm-clear-verified-payloads": { key: "confirmClearVerifiedPayloads", type: "boolean" },
    },
    {
      dryRun: false,
      batch: 100,
      concurrency: 4,
      limit: null,
      clearVerified: false,
      confirmClearVerifiedPayloads: false,
    },
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

if (args.clearVerified !== args.confirmClearVerifiedPayloads) {
  console.error(
    "Refusing to run: clearing verified payloads requires BOTH --clear-verified AND " +
      "--confirm-clear-verified-payloads. Pass neither to archive-only, or both to also run the clear sweep.",
  );
  process.exit(1);
}
const runClearSweep = args.clearVerified && args.confirmClearVerifiedPayloads;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in .env.local (Supabase -> Settings -> Database -> Session pooler).");
  process.exit(1);
}

const failureLogPath = `${repoRoot}/pgcr-reconcile-failures.jsonl`;
writeFileSync(failureLogPath, "");

function logFailure(instanceId, errorClass) {
  appendFileSync(failureLogPath, `${JSON.stringify({ instanceId, errorClass })}\n`);
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const startedAt = Date.now();
  let archiveCounts = {};
  let clearCounts = {};

  try {
    console.log(`\n=== Archive sweep (batch=${args.batch}, limit=${args.limit ?? "none"}, dryRun=${args.dryRun}) ===`);
    archiveCounts = await runSweep({
      fetchPage: (cursor, pageSize) => fetchArchivePage(client, cursor, pageSize),
      processRow: (row) => processArchiveRow(client, row, { dryRun: args.dryRun, onFailure: logFailure }),
      keyOf: (row) => row.instance_id,
      batchSize: args.batch,
      limit: args.limit,
      concurrency: args.concurrency,
      onUnexpectedError: (row) => logFailure(row.instance_id, "unexpected_worker_error"),
    });
    console.log(JSON.stringify(archiveCounts, null, 2));

    if (runClearSweep) {
      console.log(`\n=== Clear sweep (batch=${args.batch}, limit=${args.limit ?? "none"}, dryRun=${args.dryRun}) ===`);
      clearCounts = await runSweep({
        fetchPage: (cursor, pageSize) => fetchClearPage(client, cursor, pageSize),
        processRow: (row) => processClearRow(client, row, { dryRun: args.dryRun, onFailure: logFailure }),
        keyOf: (row) => row.instance_id,
        batchSize: args.batch,
        limit: args.limit,
        concurrency: args.concurrency,
        onUnexpectedError: (row) => logFailure(row.instance_id, "unexpected_worker_error"),
      });
      console.log(JSON.stringify(clearCounts, null, 2));
    } else {
      console.log("\nClear sweep skipped (pass --clear-verified --confirm-clear-verified-payloads to run it).");
    }
  } finally {
    await client.end();
  }

  const elapsedMs = Date.now() - startedAt;
  console.log("\n=== PGCR archive reconciliation summary ===");
  console.log(JSON.stringify({ archive: archiveCounts, clear: runClearSweep ? clearCounts : null, elapsedMs, dryRun: args.dryRun }, null, 2));

  const anyFailures = (archiveCounts.failed ?? 0) > 0 || (archiveCounts.conflicts ?? 0) > 0
    || (clearCounts.failed ?? 0) > 0;
  if (anyFailures) {
    console.log(`\nSome rows failed or conflicted - see ${failureLogPath}`);
  }
  process.exit(anyFailures ? 1 : 0);
}

main().catch((err) => {
  console.error("Reconciliation run failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
