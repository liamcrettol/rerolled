import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { commitSlotPick } from "@/lib/draft/optionsService";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  slot: z.enum(["kinetic", "energy", "power"]),
  itemHash: z.number().int().positive(),
});

// Captain-only: commits one of the 3 revealed candidates into
// lobby_loadout_slots — the same row shape /api/roulette/roll writes, so the
// rest of the round (realtime slot merge, Apply) needs no special-casing for
// Draft mode (#266).
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, roundId, slot, itemHash } = schema.parse(await req.json());
    const result = await commitSlotPick(lobbyId, roundId, slot, itemHash, session.userId);
    if (!result.ok) {
      const status = result.error?.includes("captain") ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
