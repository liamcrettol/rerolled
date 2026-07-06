import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { getActiveDraftSessionId, getDraftState } from "@/lib/draft/service";

// Looks up the active ("picking") draft session for a lobby, if any, so the
// client can decide between "start a draft" and "resume the in-progress one".
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lobbyId: string }> }
) {
  try {
    await requireSession();
    const { lobbyId } = await params;
    const sessionId = await getActiveDraftSessionId(lobbyId);
    if (!sessionId) return NextResponse.json({ sessionId: null });

    const state = await getDraftState(sessionId);
    return NextResponse.json({
      sessionId,
      picks: state.state?.picks ?? [],
      currentTurn: state.currentTurn,
      complete: state.complete,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
