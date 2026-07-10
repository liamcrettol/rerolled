import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { queueCrucibleSync } from "@/lib/crucible/queueSync";
import { syncRecentCrucibleHistory } from "@/lib/crucible/sync";

// On-view sync: the dashboard fires this on load so the viewer's newest Crucible
// matches import immediately, instead of waiting on the backfill cron. Bounded to
// the newest activity page, so it comfortably fits a request.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const session = await requireSession();
    // Sign-in is the usual backfill enrollment point, but a user whose session
    // predates the backfill feature (or whose sign-in enqueue failed) would
    // otherwise never get a sync-state row and never backfill. Enrolling here is
    // idempotent and freshness-gated, so a routine page view is one cheap read.
    await queueCrucibleSync(session.userId).catch(() => {});
    const { imported } = await syncRecentCrucibleHistory(session.userId);
    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh Crucible history";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
