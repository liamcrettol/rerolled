import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { transitionRun } from "@/lib/scoreAttack/runs";
import { z } from "zod";

// Advance a run the caller owns through a client-driven state (#246). The FSM
// rejects illegal transitions and any attempt to claim a worker-owned result
// state (parsed/scored/finalized/…) — those are set by the worker only.
const schema = z.object({
  next: z.enum([
    "loadout_rolled",
    "applied",
    "in_activity",
    "completed_pending_pgcr",
    "abandoned",
  ]),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const { next } = schema.parse(await req.json());

    const result = await transitionRun({ runId: id, userId: session.userId, next, actor: "client" });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus ?? 400 });
    }
    return NextResponse.json({ runId: result.runId, status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
