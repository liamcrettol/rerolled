// Run raw SQL directly against the Supabase Postgres instance — used for
// running migrations by hand and for one-off inspection queries, as an
// alternative to pasting into the Supabase SQL editor.
//
// Requires DATABASE_URL in .env.local (never commit this value — get your own
// from Supabase Dashboard -> Project Settings -> Database -> Connection
// string -> Session pooler, with the password revealed).
//
// Usage:
//   node scripts/db-query.mjs "SELECT * FROM lobbies LIMIT 5;"
//   node scripts/db-query.mjs supabase/migrations/025_something.sql
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

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/db-query.mjs "SQL"  |  node scripts/db-query.mjs file.sql');
  process.exit(1);
}
const sql = existsSync(arg) ? readFileSync(arg, "utf8") : arg;

if (!process.env.DATABASE_URL) {
  console.error(
    "Missing DATABASE_URL in .env.local. Get your own connection string from " +
      "Supabase Dashboard -> Project Settings -> Database -> Connection string " +
      "(Session pooler tab) and add it as DATABASE_URL=... to .env.local."
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  for (const r of results) {
    if (r.rows?.length) console.table(r.rows);
    else console.log(`OK (${r.command}, ${r.rowCount ?? 0} rows affected)`);
  }
} catch (err) {
  console.error("Query failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
