import { NextResponse } from "next/server";
import { requireSession, getBungieToken, isBungieAuthErrorMessage } from "@/lib/auth/helpers";
import { getCharacters } from "@/lib/bungie/inventory";
import { toClientErrorMessage } from "@/lib/api/errors";

export async function GET() {
  try {
    const session = await requireSession();
    const token = await getBungieToken(session.userId, session.bungieMembershipId);
    const characters = await getCharacters(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );
    characters.sort(
      (a, b) => new Date(b.dateLastPlayed).getTime() - new Date(a.dateLastPlayed).getTime()
    );
    return NextResponse.json({ characters });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = isBungieAuthErrorMessage(msg) ? 401 : 500;
    if (status === 500) console.error("[bungie/characters] request failed:", msg);
    return NextResponse.json({ error: toClientErrorMessage(msg, status) }, { status });
  }
}
