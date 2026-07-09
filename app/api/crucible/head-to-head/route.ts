import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/helpers";
import { getHeadToHeadSummaries } from "@/lib/crucible/headToHead";

const querySchema = z.object({
  opponents: z.string().min(1),
  mode: z.enum(["all", "trials", "competitive", "control", "iron_banner", "other"]).default("all"),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const ids = [...new Set(parsed.opponents.split(",").map((id) => id.trim()).filter(Boolean))];
    if (ids.length > 50 || ids.some((id) => !/^\d{1,30}$/.test(id))) {
      return NextResponse.json({ error: "Invalid opponent membership IDs" }, { status: 400 });
    }
    const summaries = await getHeadToHeadSummaries({
      viewerUserId: session.userId,
      opponentMembershipIds: ids,
      mode: parsed.mode,
    });
    return NextResponse.json({ summaries });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    const message = error instanceof Error ? error.message : "Unable to load head-to-head records";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

