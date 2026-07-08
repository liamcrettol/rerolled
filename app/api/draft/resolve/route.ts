import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { resolveSlotTimeout } from "@/lib/draft/voteService";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  slot: z.enum(["kinetic", "energy", "power"]),
});

// Any lobby member: the 30s-timeout fallback for a slot vote (#315).
// Tallies whatever votes exist (random pick if none, random among ties) and
// commits. Idempotent against an already-committed slot, since every
// member's client runs this same timer independently.
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, roundId, slot } = schema.parse(await req.json());
    const result = await resolveSlotTimeout(lobbyId, roundId, slot, session.userId);
    if (!result.ok) {
      const status = result.error?.includes("not in this lobby") ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, resolved: result.resolved, itemHash: result.itemHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
