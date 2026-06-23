import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("captain_user_id, current_round")
      .eq("id", lobbyId)
      .single();

    if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    if (lobby.captain_user_id !== session.userId) {
      return NextResponse.json({ error: "Only the captain can advance the round" }, { status: 403 });
    }

    const nextRound = lobby.current_round + 1;

    await adminSupabase.from("lobby_rounds").insert({
      lobby_id: lobbyId,
      round_number: nextRound,
      status: "pending",
    });

    await adminSupabase
      .from("lobby_members")
      .update({ is_ready: false })
      .eq("lobby_id", lobbyId);

    await adminSupabase
      .from("lobbies")
      .update({ current_round: nextRound, status: "waiting" })
      .eq("id", lobbyId);

    return NextResponse.json({ ok: true, round: nextRound });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
