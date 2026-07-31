import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { releaseSignupSlot, reserveSignupSlot } from "@/lib/auth/signupCapacity";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.RIVAL_SYNC_SECRET;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { status: "temporary_verification_failure", error: { code: "unauthorized" } },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null) as { userId?: string } | null;
  if (!body?.userId) {
    return NextResponse.json(
      { status: "temporary_verification_failure", error: { code: "invalid_request" } },
      { status: 400 },
    );
  }

  try {
    const result = await reserveSignupSlot(body.userId, "rival");
    if (!result.allowed) {
      return NextResponse.json(result, {
        status: 409,
        headers: { "Cache-Control": "no-store, private" },
      });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[internal/rival/signup-capacity] temporary verification failure", {
      route: "/api/internal/rival/signup-capacity",
      reason: message,
    });
    return NextResponse.json(
      { status: "temporary_verification_failure", error: { code: "capacity_backend_unavailable" } },
      { status: 503 },
    );
  }
}

// Compensates a prior reservation from this endpoint whose Rival account was
// never actually persisted (e.g. token encryption or a users/bungie_accounts
// upsert failed non-transiently after the slot was reserved). Best-effort:
// releaseSignupSlot swallows its own errors, so this always reports success
// once the request is authorized and well-formed.
export async function DELETE(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { status: "temporary_verification_failure", error: { code: "unauthorized" } },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null) as { userId?: string } | null;
  if (!body?.userId) {
    return NextResponse.json(
      { status: "temporary_verification_failure", error: { code: "invalid_request" } },
      { status: 400 },
    );
  }

  await releaseSignupSlot(body.userId);
  return NextResponse.json({ status: "released" }, { headers: { "Cache-Control": "no-store, private" } });
}
