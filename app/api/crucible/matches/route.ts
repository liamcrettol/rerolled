import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { getCrucibleMatchHistory } from "@/lib/crucible/matchHistory";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const history = await getCrucibleMatchHistory(session.userId, { limit: 20 });
    return NextResponse.json(history);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Crucible matches";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
