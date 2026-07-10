// One-time backfill: fill in crucible_matches.activity_image for matches that
// were imported before migration 050 (or before the map-image feature shipped).
//
// The map banner comes from each activity's Bungie pgcrImage. Only a few dozen
// distinct activities exist even across thousands of matches, so we resolve each
// activity_hash once and bulk-update every match that shares it.
//
// Requires, in .env.local (or the shell env):
//   DATABASE_URL   - Supabase Session pooler connection string (same as db-query.mjs)
//   BUNGIE_API_KEY - a Bungie API key (X-API-Key for the manifest endpoint)
//
// Usage:
//   node scripts/backfill-crucible-images.mjs           # apply
//   node scripts/backfill-crucible-images.mjs --dry-run # report only, no writes
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(repoRoot, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.replace(/\r$/, "").match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}

const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in .env.local (Supabase -> Settings -> Database -> Session pooler).");
  process.exit(1);
}
if (!process.env.BUNGIE_API_KEY) {
  console.error("Missing BUNGIE_API_KEY. Set it in .env.local or inline: BUNGIE_API_KEY=xxx node scripts/backfill-crucible-images.mjs");
  process.exit(1);
}

const apiKey = process.env.BUNGIE_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolvePgcrImage(hash) {
  try {
    const res = await fetch(
      `https://www.bungie.net/Platform/Destiny2/Manifest/DestinyActivityDefinition/${hash}/`,
      { headers: { "X-API-Key": apiKey } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const image = json.Response?.pgcrImage;
    return typeof image === "string" && image.length > 0 ? image : null;
  } catch {
    return null;
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const { rows: hashes } = await client.query(
    "select distinct activity_hash from crucible_matches where activity_image is null and activity_hash is not null",
  );
  console.log(`${hashes.length} distinct activity hashes need an image${dryRun ? " (dry run)" : ""}.`);

  let resolved = 0;
  let matchesUpdated = 0;
  let noImage = 0;

  for (const { activity_hash } of hashes) {
    const image = await resolvePgcrImage(activity_hash);
    if (!image) {
      noImage++;
      console.log(`  ${activity_hash}: no pgcrImage, skipping`);
      continue;
    }
    resolved++;
    if (dryRun) {
      console.log(`  ${activity_hash}: ${image}`);
    } else {
      const upd = await client.query(
        "update crucible_matches set activity_image = $1, updated_at = now() where activity_hash = $2 and activity_image is null",
        [image, activity_hash],
      );
      matchesUpdated += upd.rowCount ?? 0;
      console.log(`  ${activity_hash}: ${image}  (${upd.rowCount ?? 0} matches)`);
    }
    await sleep(120); // be gentle with the Bungie manifest endpoint
  }

  console.log(
    dryRun
      ? `\nDry run complete: ${resolved} activities would get an image, ${noImage} have none.`
      : `\nDone: updated ${matchesUpdated} matches across ${resolved} activities (${noImage} activities have no image).`,
  );
} catch (err) {
  console.error("Backfill failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
