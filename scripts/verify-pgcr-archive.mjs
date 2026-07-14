// Post-migration validation tool. Checks that the Appwrite archive and
// Supabase's pgcr_cache metadata actually agree, without trusting either
// side's self-report:
//   - count parity between pgcr_cache's verified rows and the bucket's real
//     paginated file list in the lightweight/default mode
//   - (--full) a stable, read-only DB target snapshot: zero unarchived raw
//     rows, complete metadata, and a fresh download+checksum+byte-length
//     verification of every object in that target, without chasing writes
//     that arrive after verification starts
//   - (--sample N) N evenly-spaced verified rows are downloaded, checksummed
//     against appwrite_sha256, and JSON-parsed
//   - (--parse-check, with --sample) additionally runs the real parsePgcr()
//     against both copies of each sampled row via a `tsx` subprocess
//
// Exits non-zero on any conflict, missing object, or checksum failure so it
// can gate the "100% verification before cleanup" step in docs/pgcr-archive.md.
//
// Requires, in .env.local (or the shell env):
//   DATABASE_URL       - Supabase Session pooler connection string (same as db-query.mjs)
//   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_PGCR_BUCKET_ID
//
// Usage:
//   node scripts/verify-pgcr-archive.mjs                       # count parity + 25-row sample
//   node scripts/verify-pgcr-archive.mjs --sample 200
//   node scripts/verify-pgcr-archive.mjs --full --concurrency 24
//   node scripts/verify-pgcr-archive.mjs --full --sample 200 --parse-check
//
// Never prints connection strings, API keys, or PGCR payload contents.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { loadDotEnvLocal, getRawPgcrBytes, sha256Of, listBucketFileIds } from "./lib/pgcrArchiveCore.mjs";
import { CliArgumentError, parseStrictArgs } from "./lib/strictArgs.mjs";
import { assessArchiveCounts } from "./lib/verificationGate.mjs";
import { mapWithConcurrency } from "./lib/boundedWorkers.mjs";
import {
  captureFullVerificationTarget,
  chooseEvenlySpacedIds,
  findUnaccountedBucketIds,
  readVerificationState,
} from "./lib/stableVerification.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
loadDotEnvLocal(repoRoot);

function parseArgs(argv) {
  return parseStrictArgs(
    argv,
    {
      "--full": { key: "full", type: "boolean" },
      "--sample": { key: "sample", type: "positiveInteger" },
      "--concurrency": { key: "concurrency", type: "positiveInteger" },
      "--parse-check": { key: "parseCheck", type: "boolean" },
    },
    { full: false, sample: null, concurrency: 24, parseCheck: false },
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

const sampleWasExplicit = args.sample !== null;
args.sample = args.sample ?? (args.full ? 0 : 25);
if (args.full && args.parseCheck && !sampleWasExplicit) {
  console.error("Invalid arguments: --parse-check with --full requires an explicit --sample value");
  process.exit(2);
}

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in .env.local (Supabase -> Settings -> Database -> Session pooler).");
  process.exit(1);
}

async function runParseCheck(instanceId, archivedBytes, supabaseText) {
  const dir = mkdtempSync(join(tmpdir(), "pgcr-verify-"));
  try {
    const archivedPath = join(dir, "archived.json");
    const supabasePath = join(dir, "supabase.json");
    writeFileSync(archivedPath, archivedBytes);
    writeFileSync(supabasePath, supabaseText);
    const out = execFileSync(
      "npx",
      ["tsx", join(repoRoot, "scripts/lib/parseCompare.mts"), archivedPath, supabasePath],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(out.trim().split("\n").pop());
  } catch (err) {
    return { ok: false, error: `parse-check subprocess failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const problems = [];

  try {
    let state;
    let fullTargets = null;
    if (args.full) {
      const captured = await captureFullVerificationTarget(client);
      state = captured.state;
      fullTargets = captured.targets;
      console.log(`Stable full-verification target: ${fullTargets.length} migrated row(s).`);
    } else {
      state = await readVerificationState(client);
    }
    const verifiedCount = Number(state.verified_count);
    const unarchivedRawCount = Number(state.unarchived_raw_count);
    const incompleteMetadataCount = Number(state.incomplete_metadata_count);
    console.log(`Supabase: ${verifiedCount} row(s) marked appwrite_migrated_at.`);
    console.log(`Supabase: ${unarchivedRawCount} raw row(s) are not archived yet.`);

    const bucketFileIds = await listBucketFileIds();
    const bucketCount = bucketFileIds.length;
    console.log(`Appwrite: ${bucketCount} object(s) in the bucket (paginated count, not the console total).`);

    problems.push(...assessArchiveCounts({
      verifiedCount,
      unarchivedRawCount,
      incompleteMetadataCount,
      bucketCount,
      requireComplete: args.full,
      // A live full run verifies its frozen target directly. New bucket/DB
      // writes after that snapshot may legitimately change aggregate counts.
      requireCountParity: !args.full,
    }));
    if (args.full && fullTargets.length !== verifiedCount) {
      problems.push(
        `SNAPSHOT: target row count ${fullTargets.length} did not match snapshot verified count ${verifiedCount}.`,
      );
    }

    if (args.full) {
      console.log(`\nChecking every migrated object by ID, checksum, and byte length (concurrency=${args.concurrency})...`);
      let checked = 0;
      let missing = 0;
      let mismatched = 0;
      const migratedIds = new Set(fullTargets.map((row) => row.instance_id));
      for (let offset = 0; offset < fullTargets.length; offset += 500) {
        const rows = fullTargets.slice(offset, offset + 500);
        checked += rows.length;

        const pageResults = await mapWithConcurrency(rows, args.concurrency, async (row) => {
          const instanceId = row.instance_id;
          const rowProblems = [];
          const bytes = await getRawPgcrBytes(instanceId);
          if (bytes === null) {
            return {
              missing: 1,
              mismatched: 0,
              problems: [`INTEGRITY: ${instanceId} is marked verified but has no Appwrite object.`],
            };
          }
          let rowMismatches = 0;
          const actualSha256 = sha256Of(bytes);
          if (actualSha256 !== row.appwrite_sha256) {
            rowMismatches++;
            rowProblems.push(`CHECKSUM: ${instanceId} expected ${row.appwrite_sha256}, got ${actualSha256}.`);
          }
          if (row.appwrite_bytes === null || BigInt(row.appwrite_bytes) !== BigInt(bytes.byteLength)) {
            rowMismatches++;
            rowProblems.push(`SIZE: ${instanceId} metadata=${row.appwrite_bytes ?? "null"}, downloaded=${bytes.byteLength}.`);
          }
          return { missing: 0, mismatched: rowMismatches, problems: rowProblems };
        });
        for (const result of pageResults) {
          missing += result.missing;
          mismatched += result.mismatched;
          problems.push(...result.problems);
        }
      }

      // Bucket objects outside the frozen target may have been created by
      // concurrent writes. Re-check them against current DB state in bounded
      // chunks and fail only IDs with no durable raw/migrated row.
      const extraBucketIds = bucketFileIds.filter((id) => !migratedIds.has(id));
      const unaccountedBucketIds = await findUnaccountedBucketIds(client, extraBucketIds, 500);
      for (const instanceId of unaccountedBucketIds) {
        problems.push(`ORPHAN: Appwrite object ${instanceId} has no durable or in-flight pgcr_cache row.`);
      }
      const concurrentExtras = extraBucketIds.length - unaccountedBucketIds.length;
      if (concurrentExtras > 0) {
        console.log(`Ignored ${concurrentExtras} post-snapshot/in-flight bucket object(s) with matching DB rows.`);
      }
      console.log(`Checked ${checked} row(s), ${missing} missing, ${mismatched} metadata/content mismatch(es).`);
    }

    if (args.sample > 0) {
      let candidateIds;
      if (args.full) {
        candidateIds = fullTargets.map((row) => row.instance_id);
      } else {
        const { rows } = await client.query(
          `select instance_id from pgcr_cache
           where appwrite_migrated_at is not null
           order by instance_id`,
        );
        candidateIds = rows.map((row) => row.instance_id);
      }
      const sampleIds = chooseEvenlySpacedIds(candidateIds, args.sample);
      console.log(`\nSampling ${sampleIds.length} verified row(s) for download + checksum verification...`);
      const { rows: sampleRows } = sampleIds.length === 0
        ? { rows: [] }
        : await client.query(
          `select instance_id, appwrite_sha256, raw_pgcr::text as supabase_text
           from pgcr_cache
           where instance_id = any($1::text[])
           order by instance_id`,
          [sampleIds],
        );
      if (sampleRows.length !== sampleIds.length) {
        problems.push(`SAMPLE: requested ${sampleIds.length} snapshot row(s), but only ${sampleRows.length} still exist.`);
      }

      let verified = 0;
      let mismatched = 0;
      let missing = 0;
      let parseChecked = 0;
      let parseMismatched = 0;

      for (const row of sampleRows) {
        const bytes = await getRawPgcrBytes(row.instance_id);
        if (bytes === null) {
          missing++;
          problems.push(`INTEGRITY: sampled row ${row.instance_id} is marked verified but download returned 404.`);
          continue;
        }
        const actualSha256 = sha256Of(bytes);
        if (actualSha256 !== row.appwrite_sha256) {
          mismatched++;
          problems.push(`CHECKSUM: ${row.instance_id} expected ${row.appwrite_sha256}, got ${actualSha256}.`);
          continue;
        }
        try {
          JSON.parse(bytes.toString("utf8"));
        } catch {
          mismatched++;
          problems.push(`PARSE: ${row.instance_id} archived object is not valid JSON.`);
          continue;
        }
        verified++;

        if (args.parseCheck && row.supabase_text) {
          parseChecked++;
          const result = await runParseCheck(row.instance_id, bytes, row.supabase_text);
          if (!result.ok) {
            parseMismatched++;
            problems.push(`PARSE-CHECK: ${row.instance_id} normalized differently (${result.error ?? "mismatch"}).`);
          }
        }
      }

      console.log(
        `Sample results: verified=${verified} mismatched=${mismatched} missing=${missing}` +
          (args.parseCheck ? ` parseChecked=${parseChecked} parseMismatched=${parseMismatched}` : ""),
      );
    }
  } finally {
    await client.end();
  }

  console.log("\n=== Verification summary ===");
  if (problems.length === 0) {
    console.log("No conflicts, missing objects, or checksum failures found.");
    process.exit(0);
  }
  console.log(`${problems.length} problem(s) found:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Verification run failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
