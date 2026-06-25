import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  spectate: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, spectate } = schema.parse(await req.json());

    const { data: member } = await adminSupabase
      .from("lobby_members")
      .select("is_captain")
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId)
      .single();

    if (!member) return NextResponse.json({ error: "Not in lobby" }, { status: 404 });
    if (member.is_captain && spectate) {
      return NextResponse.json({ error: "Captain cannot spectate" }, { status: 400 });
    }

    await adminSupabase
      .from("lobby_members")
      .update({ is_spectator: spectate })
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
