import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { createRun } from "@/lib/scoreAttack/runs";
import { z } from "zod";

// Start a Score Attack or Weekly Challenge run (#246). Weekly runs are gated on
// the challenge window server-side (#251).
const schema = z.object({
  mode: z.enum(["score_attack", "weekly_challenge"]),
  weeklyChallengeId: z.string().uuid().nullish(),
  lobbyId: z.string().uuid().nullish(),
  roundId: z.string().uuid().nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    const result = await createRun({
      userId: session.userId,
      bungieMembershipId: session.bungieMembershipId,
      bungieMembershipType: session.bungieMembershipType,
      mode: body.mode,
      weeklyChallengeId: body.weeklyChallengeId ?? null,
      lobbyId: body.lobbyId ?? null,
      roundId: body.roundId ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus ?? 400 });
    }
    return NextResponse.json({ runId: result.runId, status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
