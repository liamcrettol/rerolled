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

    // Errors here must be checked: supabase-js resolves with { error } rather
    // than throwing, so a swallowed failure would advance current_round past a
    // round that has no lobby_rounds row, and lobby/state (which looks the
    // round up by round_number) would resolve roundId: null forever.
    //
    // Upsert rather than insert: (lobby_id, round_number) is unique, so if the
    // current_round update below fails after the row lands, the captain's retry
    // would otherwise collide with it permanently. Same idiom as the
    // onConflict upsert in app/api/apply/route.ts.
    const { error: roundErr } = await adminSupabase.from("lobby_rounds").upsert(
      {
        lobby_id: lobbyId,
        round_number: nextRound,
        status: "pending",
      },
      { onConflict: "lobby_id,round_number" }
    );

    if (roundErr) throw new Error(roundErr.message ?? "Failed to create next round");

    const { error: membersErr } = await adminSupabase
      .from("lobby_members")
      .update({ is_ready: false })
      .eq("lobby_id", lobbyId);

    if (membersErr) throw new Error(membersErr.message ?? "Failed to reset ready state");

    const { error: lobbyErr } = await adminSupabase
      .from("lobbies")
      .update({ current_round: nextRound, status: "waiting", last_active_at: new Date().toISOString() })
      .eq("id", lobbyId);

    if (lobbyErr) throw new Error(lobbyErr.message ?? "Failed to advance the round");

    return NextResponse.json({ ok: true, round: nextRound });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    if (status !== 401) console.error("[lobby/next-round] request failed:", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
