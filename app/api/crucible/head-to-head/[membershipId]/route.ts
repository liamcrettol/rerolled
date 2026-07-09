import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/helpers";
import { getHeadToHeadMatches, getHeadToHeadSummary } from "@/lib/crucible/headToHead";

const querySchema = z.object({
  mode: z.enum(["all", "trials", "competitive", "control", "iron_banner", "other"]).default("all"),
  cursor: z.string().optional(),
});

export async function GET(req: NextRequest, context: { params: Promise<{ membershipId: string }> }) {
  try {
    const session = await requireSession();
    const { membershipId } = await context.params;
    if (!/^\d{1,30}$/.test(membershipId)) return NextResponse.json({ error: "Invalid membership ID" }, { status: 400 });
    const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const [summary, detail] = await Promise.all([
      getHeadToHeadSummary({ viewerUserId: session.userId, opponentMembershipId: membershipId, mode: query.mode }),
      getHeadToHeadMatches({ viewerUserId: session.userId, opponentMembershipId: membershipId, mode: query.mode, cursor: query.cursor }),
    ]);
    return NextResponse.json({ summary, ...detail });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    const message = error instanceof Error ? error.message : "Unable to load head-to-head detail";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
