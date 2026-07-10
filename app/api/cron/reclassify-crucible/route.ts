import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { adminSupabase } from "@/lib/supabase/admin";
import { resolveActivity } from "@/lib/bungie/pgcr";
import { classifyCrucibleMode } from "@/lib/crucible/modes";

// One-time (idempotent) reclassification of crucible_matches.mode_bucket for
// matches imported before classification also consulted the activity
// definition's mode types. Resolves each distinct activity_hash's modes once,
// recomputes the bucket, and rewrites it in both crucible_matches and the
// denormalized crucible_encounters. Safe to re-run; only rows whose bucket
// actually changes are written. Remove after use.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();

  const { data, error } = await adminSupabase
    .from("crucible_matches")
    .select("instance_id, activity_hash, activity_mode, activity_modes, activity_name, mode_bucket");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const modesByHash = new Map<number, number[]>();
  const sampleByHash = new Map<number, unknown>();
  let updated = 0;
  let unchanged = 0;
  let remaining = 0;

  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - startedAt > 50_000) {
      remaining = rows.length - i;
      break;
    }
    const row = rows[i];
    const hash = row.activity_hash != null ? Number(row.activity_hash) : null;

    let defModes: number[] = [];
    if (hash != null) {
      const cached = modesByHash.get(hash);
      if (cached) {
        defModes = cached;
      } else {
        defModes = (await resolveActivity(hash)).modes;
        modesByHash.set(hash, defModes);
      }
    }

    const bucket = classifyCrucibleMode({
      activityMode: row.activity_mode ?? null,
      activityModes: [...(row.activity_modes ?? []), ...defModes],
      activityHash: hash,
      activityName: row.activity_name ?? null,
    });

    // Diagnostic: one sample per distinct activity to see what Bungie reports.
    if (hash != null && !sampleByHash.has(hash)) {
      sampleByHash.set(hash, {
        hash,
        name: row.activity_name,
        activityMode: row.activity_mode,
        activityModes: row.activity_modes,
        defModes,
        storedBucket: row.mode_bucket,
        computedBucket: bucket,
      });
    }

    if (bucket === row.mode_bucket) {
      unchanged++;
      continue;
    }

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminSupabase.from("crucible_matches").update({ mode_bucket: bucket, updated_at: now } as any).eq("instance_id", row.instance_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminSupabase.from("crucible_encounters").update({ mode_bucket: bucket } as any).eq("instance_id", row.instance_id);
    updated++;
  }

  return NextResponse.json({ ok: true, total: rows.length, updated, unchanged, remaining, samples: [...sampleByHash.values()] });
}
