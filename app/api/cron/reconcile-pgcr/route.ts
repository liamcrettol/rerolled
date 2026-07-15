import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";
import { reconcilePendingPgcrs } from "@/lib/pgcr/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  try {
    const result = await reconcilePendingPgcrs();
    const payload = {
      ok: result.failed === 0,
      state: result.failed > 0 ? "partial_failure" : result.remaining > 0 ? "progress" : "idle",
      ...result,
    };
    console.log("[cron/reconcile-pgcr] run summary:", payload);
    return NextResponse.json(payload, { status: result.failed > 0 ? 207 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/reconcile-pgcr] run error:", message);
    return NextResponse.json({
      ok: false,
      state: "error",
      message: "PGCR archive reconciliation could not inspect or process the outbox.",
      error: message,
    }, { status: 500 });
  }
}
