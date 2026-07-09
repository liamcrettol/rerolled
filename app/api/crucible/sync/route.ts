import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { queueCrucibleSync } from "@/lib/crucible/queueSync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await requireSession();
    const state = await queueCrucibleSync(session.userId);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to queue Crucible history";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

