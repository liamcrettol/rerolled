import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { startDraftSession } from "@/lib/draft/service";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: member } = await adminSupabase
      .from("lobby_members")
      .select("user_id")
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId)
      .single();
    if (!member) {
      return NextResponse.json({ error: "You're not in this lobby" }, { status: 403 });
    }

    const result = await startDraftSession(lobbyId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ sessionId: result.sessionId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
