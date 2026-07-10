import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { adminSupabase } from "@/lib/supabase/admin";
import { resolveActivity } from "@/lib/bungie/pgcr";

// One-time (idempotent) backfill of crucible_matches.activity_image for matches
// imported before the map-image feature. Only a few dozen distinct activities
// exist, so we resolve each activity_hash's pgcrImage once and bulk-update every
// match that shares it. Triggered by the backfill-crucible-images workflow with
// Authorization: Bearer CRON_SECRET. Safe to re-run: it only touches rows whose
// activity_image is still null.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();

  const { data, error } = await adminSupabase
    .from("crucible_matches")
    .select("activity_hash")
    .is("activity_image", null)
    .not("activity_hash", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hashes = [...new Set((data ?? []).map((row) => row.activity_hash).filter((h) => h !== null))];

  let resolved = 0;
  let matchesUpdated = 0;
  let noImage = 0;
  let remaining = 0;

  for (let i = 0; i < hashes.length; i++) {
    if (Date.now() - startedAt > 50_000) {
      remaining = hashes.length - i;
      break;
    }
    const hash = hashes[i];
    const { image } = await resolveActivity(Number(hash));
    if (!image) {
      noImage++;
      continue;
    }
    const { count, error: updateError } = await adminSupabase
      .from("crucible_matches")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ activity_image: image, updated_at: new Date().toISOString() } as any, { count: "exact" })
      .eq("activity_hash", hash)
      .is("activity_image", null);
    if (updateError) continue;
    resolved++;
    matchesUpdated += count ?? 0;
  }

  return NextResponse.json({
    ok: true,
    distinctHashes: hashes.length,
    resolved,
    matchesUpdated,
    noImage,
    remaining,
  });
}
