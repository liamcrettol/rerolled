import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { adminSupabase } from "@/lib/supabase/admin";
import { readRawPgcr } from "@/lib/pgcr/service";
import { parsePgcr } from "@/lib/scoreAttack/pgcr";

// One-time (idempotent) backfill of win/loss for matches imported before the
// team-standing parse fix. Re-parses each match's cached PGCR (no Bungie calls)
// and rewrites is_win on crucible_match_players and viewer_won on
// crucible_encounters. Resumable: it only looks at matches that still have an
// unresolved player result. Remove after use.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();

  const { data: nullRows, error } = await adminSupabase
    .from("crucible_match_players")
    .select("instance_id")
    .is("is_win", null)
    .limit(6000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const instanceIds = [...new Set((nullRows ?? []).map((row) => row.instance_id))];

  let matchesProcessed = 0;
  let playersUpdated = 0;
  let remaining = 0;

  for (let i = 0; i < instanceIds.length; i++) {
    if (Date.now() - startedAt > 50_000) {
      remaining = instanceIds.length - i;
      break;
    }
    const instanceId = instanceIds[i];
    // Raw PGCRs may live in Appwrite, Supabase, or (before a row is cleared)
    // both - go through the central service instead of reading raw_pgcr
    // directly so this still works once verified rows start getting cleared.
    const cacheResult = await readRawPgcr(instanceId);
    if (cacheResult.status !== "found") continue;

    const parsed = parsePgcr(cacheResult.raw);
    if (parsed.kind !== "pvp") continue;
    matchesProcessed++;

    const winners = parsed.players.filter((p) => p.isWin === true).map((p) => p.membershipId);
    const losers = parsed.players.filter((p) => p.isWin === false).map((p) => p.membershipId);

    for (const [ids, won] of [[winners, true], [losers, false]] as const) {
      if (ids.length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await adminSupabase.from("crucible_match_players").update({ is_win: won } as any).eq("instance_id", instanceId).in("membership_id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await adminSupabase.from("crucible_encounters").update({ viewer_won: won } as any).eq("instance_id", instanceId).in("viewer_membership_id", ids);
      playersUpdated += ids.length;
    }
  }

  // Diagnostic: dump the raw team structure + parsed results for the newest few
  // matches so we can see exactly where standing lives and whether it resolves.
  const samples: unknown[] = [];
  const { data: recent } = await adminSupabase
    .from("crucible_matches")
    .select("instance_id, activity_name")
    .order("period", { ascending: false })
    .limit(4);
  for (const rm of recent ?? []) {
    const sampleResult = await readRawPgcr(rm.instance_id);
    if (sampleResult.status !== "found") {
      samples.push({ instanceId: rm.instance_id, noCache: true });
      continue;
    }
    const parsed = parsePgcr(sampleResult.raw);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = sampleResult.raw as any;
    samples.push({
      instanceId: rm.instance_id,
      name: rm.activity_name,
      kind: parsed.kind,
      rawTeams: raw?.Response?.teams ?? raw?.teams ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      players: (parsed.players ?? []).slice(0, 3).map((p: any) => ({ team: p.team, standing: p.standing, isWin: p.isWin })),
    });
  }

  return NextResponse.json({ ok: true, candidates: instanceIds.length, matchesProcessed, playersUpdated, remaining, samples });
}
