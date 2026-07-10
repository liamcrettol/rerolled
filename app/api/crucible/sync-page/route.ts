import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { syncNextCrucibleHistoryPage } from "@/lib/crucible/sync";

// Client-driven deep backfill. The dashboard calls this page by page while the
// viewer has it open, walking their Crucible history one activity page at a time
// (this replaces the server cron). Each call advances the viewer's own cursor,
// so nothing is skipped; the response says whether more pages remain.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const session = await requireSession();
    const { importedMatches, hasMore } = await syncNextCrucibleHistoryPage(session.userId);
    return NextResponse.json({ ok: true, imported: importedMatches, hasMore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync Crucible history";
    // A missing sync-state row just means there is nothing to walk yet.
    if (message.includes("Crucible sync state unavailable")) {
      return NextResponse.json({ ok: true, imported: 0, hasMore: false });
    }
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
