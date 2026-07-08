import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { joinLobby } from "@/lib/lobby";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/api/errors";
import { z } from "zod";

const schema = z.object({ code: z.string().min(4).max(10) });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const { lobby } = await joinLobby(
      body.code,
      session.userId,
      session.displayName,
      session.bungieMembershipType,
      session.bungieMembershipId
    );
    return NextResponse.json({ code: lobby.code, lobbyId: lobby.id, mode: lobby.mode });
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Lobby not found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
