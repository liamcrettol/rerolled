import { NextResponse } from "next/server";
import { requireSession, getBungieToken, isBungieAuthErrorMessage } from "@/lib/auth/helpers";
import { getWeapons } from "@/lib/bungie/inventory";
import { toClientErrorMessage } from "@/lib/api/errors";

export async function GET() {
  try {
    const session = await requireSession();
    const token = await getBungieToken(session.userId, session.bungieMembershipId);

    const weapons = await getWeapons(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );

    return NextResponse.json({ weapons });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = isBungieAuthErrorMessage(msg) ? 401 : 500;
    if (status === 500) console.error("[bungie/weapons] request failed:", msg);
    return NextResponse.json({ error: toClientErrorMessage(msg, status) }, { status });
  }
}
