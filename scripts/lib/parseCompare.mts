// Small helper invoked via `npx tsx` from scripts/verify-pgcr-archive.mjs's
// optional --parse-check pass. Runs the real lib/scoreAttack/pgcr.ts parser
// (not a reimplementation) against both copies of a sampled PGCR and reports
// whether they normalize identically. Isolated in its own tsx subprocess
// because verify-pgcr-archive.mjs is a plain .mjs script (matching
// scripts/db-query.mjs's convention) and cannot import .ts modules directly.
//
// Usage: npx tsx scripts/lib/parseCompare.mts <archivedJsonPath> <supabaseJsonPath>
// Prints one JSON line to stdout: { ok, archivedKind, supabaseKind, error? }
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { parsePgcr } from "../../lib/scoreAttack/pgcr";

const [, , archivedPath, supabasePath] = process.argv;

try {
  const archived = JSON.parse(readFileSync(archivedPath, "utf8"));
  const supabase = JSON.parse(readFileSync(supabasePath, "utf8"));
  const a = parsePgcr(archived);
  const s = parsePgcr(supabase);

  const ok = isDeepStrictEqual(a, s);

  console.log(JSON.stringify({ ok, archivedKind: a.kind, supabaseKind: s.kind }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
