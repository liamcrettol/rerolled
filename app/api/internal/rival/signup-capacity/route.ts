import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { reserveSignupSlot } from "@/lib/auth/signupCapacity";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.RIVAL_SYNC_SECRET;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { userId?: string } | null;
  if (!body?.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  try {
    const result = await reserveSignupSlot(body.userId, "rival");
    if (!result.allowed) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[internal/rival/signup-capacity] check failed", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
