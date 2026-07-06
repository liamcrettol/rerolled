import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { generateSlotOptions } from "@/lib/draft/optionsService";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  slot: z.enum(["kinetic", "energy", "power"]),
});

// Captain-only: reveals 3 candidate weapons for a slot from the shared,
// server-owned pool (#238's lobby_pools cache) — the card-reveal step of
// Draft mode (#266).
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, roundId, slot } = schema.parse(await req.json());
    const result = await generateSlotOptions(lobbyId, roundId, slot, session.userId);
    if (!result.ok) {
      const status = result.error?.includes("captain") ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ options: result.options });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
