import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getBungieToken } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.RIVAL_SYNC_SECRET;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

// Rival mirrors the site's account roster but never copies OAuth ciphertext.
// This endpoint lets the source application remain the sole owner of refresh
// token rotation while issuing Rival a short-lived access token for history.
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { userId?: string; membershipId?: string } | null;
  if (!body?.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  try {
    const accessToken = await getBungieToken(body.userId, body.membershipId);
    return NextResponse.json(
      { accessToken },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[internal/rival/bungie-token] token retrieval failed for user", body.userId, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
