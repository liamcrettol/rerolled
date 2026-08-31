import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { assignCaptain } from "@/lib/lobby";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/api/errors";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  // The member to hand captaincy to, by lobby_members.user_id.
  userId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, userId } = schema.parse(await req.json());

    // Authorize against lobbies.captain_user_id rather than the caller's
    // is_captain flag: that flag is derived state (assignCaptain rewrites it in
    // three non-transactional steps), so a lobby caught mid-hand-off could have
    // nobody flagged and lock everyone out of the control that fixes it.
    const { data: lobby, error: lobbyErr } = await adminSupabase
      .from("lobbies")
      .select("captain_user_id, status, mode")
      .eq("id", lobbyId)
      .maybeSingle();

    if (lobbyErr) throw new Error(lobbyErr.message);
    if (!lobby) return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    if (lobby.status === "done") {
      return NextResponse.json({ error: "This lobby has ended" }, { status: 409 });
    }
    // Draft lobbies never rotate captain_user_id (lib/draft/optionsService.ts'
    // requireStarter is the only authorization check for who may reveal a
    // slot's candidates, and it depends on the value staying put). This manual
    // hand-off must not be a back door around that invariant, mirroring the
    // same mode check /api/apply's auto-rotation already applies.
    if (lobby.mode === "draft") {
      return NextResponse.json(
        { error: "Captaincy cannot be reassigned in a draft lobby" },
        { status: 400 }
      );
    }
    if (lobby.captain_user_id !== session.userId) {
      return NextResponse.json({ error: "Only the captain can pass captaincy" }, { status: 403 });
    }

    if (userId === session.userId) {
      return NextResponse.json({ error: "You are already the captain" }, { status: 400 });
    }

    // The target must actually be in this lobby and playing. Spectators are
    // excluded for the same reason rotateCaptain skips them: they never roll.
    const { data: target, error: targetErr } = await adminSupabase
      .from("lobby_members")
      .select("id, user_id, is_spectator, display_name")
      .eq("lobby_id", lobbyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (targetErr) throw new Error(targetErr.message);
    if (!target) {
      return NextResponse.json({ error: "That player is not in this lobby" }, { status: 404 });
    }
    if (target.is_spectator) {
      return NextResponse.json(
        { error: "Spectators cannot be made captain" },
        { status: 400 }
      );
    }

    await assignCaptain(lobbyId, { id: target.id, user_id: target.user_id });

    return NextResponse.json({ ok: true, captainUserId: target.user_id });
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      console.error(
        "[lobby/set-captain] database unavailable:",
        err instanceof Error ? err.message : err
      );
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    if (status !== 401) console.error("[lobby/set-captain] request failed:", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
