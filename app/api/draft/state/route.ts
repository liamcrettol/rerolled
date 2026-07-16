import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

// Same-origin snapshot of everything the draft board renders. The board used
// to read these tables through the browser Supabase client, so any member
// whose browser can't reach *.supabase.co (adblock, Brave shields, DNS
// filtering) was permanently stuck on "Waiting for X to spin" while the
// starter's reveal worked fine. Serving the state from our own API (service
// role) means members only ever need to reach rerolled.io; the realtime
// channel is a latency enhancement, not a requirement.
export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("status, current_round")
      .eq("id", lobbyId)
      .single();
    if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });

    const { data: round } = await adminSupabase
      .from("lobby_rounds")
      .select("id")
      .eq("lobby_id", lobbyId)
      .eq("round_number", lobby.current_round)
      .single();
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

    const [{ data: slots }, { data: options }, { data: votes }, { data: members }] = await Promise.all([
      adminSupabase.from("lobby_loadout_slots").select("*").eq("round_id", round.id),
      adminSupabase.from("lobby_draft_options").select("*").eq("round_id", round.id),
      adminSupabase.from("lobby_draft_votes").select("*").eq("round_id", round.id),
      adminSupabase.from("lobby_members").select("*").eq("lobby_id", lobbyId),
    ]);

    return NextResponse.json({
      lobbyStatus: lobby.status,
      roundId: round.id,
      slots: slots ?? [],
      options: options ?? [],
      votes: votes ?? [],
      members: members ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
