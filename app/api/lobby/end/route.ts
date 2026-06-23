import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { rotateCaptain } from "@/lib/lobby";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("captain_user_id")
      .eq("id", lobbyId)
      .single();

    if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    if (lobby.captain_user_id !== session.userId) {
      return NextResponse.json({ error: "Only the captain can end the game" }, { status: 403 });
    }

    // Rotate captain so next session starts fresh
    await rotateCaptain(lobbyId);

    await adminSupabase
      .from("lobbies")
      .update({ status: "done" })
      .eq("id", lobbyId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
