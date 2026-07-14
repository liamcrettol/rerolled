import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

// Same-origin snapshot of the live lobby. The realtime channel is the fast
// path, but a member whose browser can't reach *.supabase.co (adblock, Brave
// shields, DNS filtering) would otherwise never see rolls, joins, or round
// advances - their board just sits frozen while everyone else plays.
// useLobbySession polls this and dispatches exactly what the realtime
// handlers would have.
export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("*")
      .eq("id", lobbyId)
      .single();
    if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });

    const [{ data: members }, { data: round }] = await Promise.all([
      adminSupabase.from("lobby_members").select("*").eq("lobby_id", lobbyId),
      adminSupabase
        .from("lobby_rounds")
        .select("id")
        .eq("lobby_id", lobbyId)
        .eq("round_number", lobby.current_round)
        .maybeSingle(),
    ]);

    let slots: unknown[] = [];
    if (round) {
      const { data } = await adminSupabase
        .from("lobby_loadout_slots")
        .select("*")
        .eq("round_id", round.id);
      slots = data ?? [];
    }

    return NextResponse.json({
      lobby,
      members: members ?? [],
      roundId: round?.id ?? null,
      slots,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
