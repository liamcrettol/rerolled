import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { createLobby } from "@/lib/lobby";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));
    const { lobby } = await createLobby(
      session.userId,
      session.displayName,
      session.bungieMembershipType,
      session.bungieMembershipId,
      body.settings ?? null,
      "roulette"
    );
    return NextResponse.json({ code: lobby.code, lobbyId: lobby.id, mode: lobby.mode });
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json(
        { error: DATABASE_UNAVAILABLE_MESSAGE },
        { status: 503 }
      );
    }

    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
