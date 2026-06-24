import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  locked: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, locked } = schema.parse(await req.json());

    // Only the current captain can toggle this
    const { data: member } = await adminSupabase
      .from("lobby_members")
      .select("is_captain")
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!member?.is_captain) {
      return NextResponse.json({ error: "Only the captain can change this" }, { status: 403 });
    }

    await adminSupabase
      .from("lobbies")
      .update({ captain_locked: locked })
      .eq("id", lobbyId);

    return NextResponse.json({ ok: true, locked });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
