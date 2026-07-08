import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { castVote } from "@/lib/draft/voteService";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  slot: z.enum(["kinetic", "energy", "power"]),
  itemHash: z.number().int().positive(),
});

// Any non-spectator lobby member: casts (or changes) one vote for a slot's
// revealed candidates. Auto-resolves into lobby_loadout_slots once every
// eligible member has voted (#315) - the fallback for stragglers is the
// client-driven 30s timer hitting /api/draft/resolve.
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, roundId, slot, itemHash } = schema.parse(await req.json());
    const result = await castVote(lobbyId, roundId, slot, itemHash, session.userId);
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
