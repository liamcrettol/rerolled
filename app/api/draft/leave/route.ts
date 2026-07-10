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
      .select("id, mode")
      .eq("id", lobbyId)
      .maybeSingle();

    // Already gone/closed is a no-op so the dashboard redirect always wins.
    if (!lobby) return NextResponse.json({ ok: true });
    if (lobby.mode !== "draft") {
      return NextResponse.json({ error: "This endpoint only closes draft lobbies." }, { status: 400 });
    }

    const { data: member } = await adminSupabase
      .from("lobby_members")
      .select("id")
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!member) return NextResponse.json({ ok: true });

    // Drafts are single-session boards. Confirming in the client makes this
    // explicit because closing the room ends the draft for the whole fireteam.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminSupabase
      .from("lobbies")
      .update({ status: "done", ended_at: new Date().toISOString() } as any)
      .eq("id", lobbyId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
