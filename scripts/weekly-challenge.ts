// Weekly challenge authoring CLI (#256).
//
// Usage:
//   npm run weekly:generate -- --week 42 --season season-0
//   npm run weekly:preview  -- --week 42 --season season-0
//   npm run weekly:publish  -- --slug season-0-week-42 --starts 2026-10-13T17:00:00Z --ends 2026-10-20T17:00:00Z
//
// Requires DATABASE_URL-adjacent Supabase env (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY) in .env.local — same as scripts/db-query.mjs.
// generate/publish write to the database; preview is read-only/pure.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(repoRoot, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.replace(/\r$/, "").match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (command === "generate") {
    const { generateWeeklyChallengeAndStoreDraft } = await import("../lib/challenges/publish");
    const { adminSupabase } = await import("../lib/supabase/admin");
    const week = Number(args.week);
    const seasonKey = args.season ?? "season-0";
    if (!Number.isFinite(week)) throw new Error("--week is required, e.g. --week 42");

    const { data: season, error } = await adminSupabase
      .from("seasons")
      .select("id")
      .eq("season_key", seasonKey)
      .single();
    if (error || !season) throw new Error(`season "${seasonKey}" not found: ${error?.message ?? "no such season_key"}`);

    const { draft, challenge } = await generateWeeklyChallengeAndStoreDraft(adminSupabase, {
      seasonKey,
      weekNumber: week,
      seasonId: season.id as string,
    });
    console.log(`Stored draft "${challenge.slug}" (id=${challenge.id}, week=${challenge.week_number})`);
    console.log(JSON.stringify(draft, null, 2));
    return;
  }

  if (command === "preview") {
    const { previewWeeklyChallengeDraft } = await import("../lib/challenges/publish");
    const week = Number(args.week);
    const seasonKey = args.season ?? "season-0";
    if (!Number.isFinite(week)) throw new Error("--week is required, e.g. --week 42");

    const { draft, validation } = previewWeeklyChallengeDraft({ seasonKey, weekNumber: week });
    console.log(JSON.stringify(draft, null, 2));
    console.log(validation.valid ? "\nValid: no warnings." : `\nWarnings:\n- ${validation.errors.join("\n- ")}`);
    return;
  }

  if (command === "rotate") {
    const { rotateWeeklyChallenges } = await import("../lib/challenges/rotate");
    const { adminSupabase } = await import("../lib/supabase/admin");
    const result = await rotateWeeklyChallenges(adminSupabase);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "publish") {
    const { publishWeeklyChallenge } = await import("../lib/challenges/publish");
    const { adminSupabase } = await import("../lib/supabase/admin");
    const slug = args.slug;
    const startsAt = args.starts;
    const endsAt = args.ends;
    if (!slug || !startsAt || !endsAt) {
      throw new Error("--slug, --starts, and --ends are required, e.g. --slug season-0-week-42 --starts ... --ends ...");
    }

    const { challenge, versionId } = await publishWeeklyChallenge(adminSupabase, { slug, startsAt, endsAt });
    console.log(`Published "${challenge.slug}" as version ${versionId}, status=${challenge.status}`);
    return;
  }

  console.error("Usage: weekly-challenge.ts <generate|preview|publish|rotate> [--week N] [--season key] [--slug s] [--starts iso] [--ends iso]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
