import { NextRequest, NextResponse } from "next/server";

// Shared auth gate for cron endpoints. They are triggered by GitHub Actions
// (and, historically, Vercel Cron) with `Authorization: Bearer ${CRON_SECRET}`.
//
// Fails closed in production: if CRON_SECRET is somehow unset on a prod
// deployment, reject the request rather than leaving the endpoint world-open.
// Outside production (local dev, or a preview without the secret) an unset
// secret is allowed so the routes stay callable by hand.
//
// Returns a NextResponse to send back when the request is rejected, or null
// when the caller may proceed.
export function assertCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    return null;
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
