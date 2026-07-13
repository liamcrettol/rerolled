import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { closeLobby, rotateCaptain } from "@/lib/lobby";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("host_user_id")
      .eq("id", lobbyId)
      .single();

    if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    if (lobby.host_user_id !== session.userId) {
      return NextResponse.json({ error: "Only the session creator can end the game" }, { status: 403 });
    }

    // Rotate captain so next session starts fresh
    await rotateCaptain(lobbyId);

    await closeLobby(lobbyId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
