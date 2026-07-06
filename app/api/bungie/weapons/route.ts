import { NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { getWeapons } from "@/lib/bungie/inventory";

export async function GET() {
  try {
    const session = await requireSession();
    const token = await getBungieToken(session.userId);

    const weapons = await getWeapons(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );

    return NextResponse.json({ weapons });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
