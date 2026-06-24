import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    const { data: member } = await adminSupabase
      .from("lobby_members")
      .select("is_captain")
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId)
      .single();

    if (!member) return NextResponse.json({ ok: true }); // already gone

    // Remove this member
    await adminSupabase
      .from("lobby_members")
      .delete()
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId);

    // If they were captain, hand off to next member
    if (member.is_captain) {
      const { data: remaining } = await adminSupabase
        .from("lobby_members")
        .select("user_id")
        .eq("lobby_id", lobbyId)
        .order("joined_at", { ascending: true })
        .limit(1);

      if (remaining?.length) {
        const newCaptain = remaining[0].user_id;
        await adminSupabase
          .from("lobby_members")
          .update({ is_captain: true })
          .eq("lobby_id", lobbyId)
          .eq("user_id", newCaptain);
        await adminSupabase
          .from("lobbies")
          .update({ captain_user_id: newCaptain })
          .eq("id", lobbyId);
      } else {
        // No one left - mark done to preserve stats (delete cascades to game_sessions)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await adminSupabase.from("lobbies").update({ status: "done", ended_at: new Date().toISOString() } as any).eq("id", lobbyId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
