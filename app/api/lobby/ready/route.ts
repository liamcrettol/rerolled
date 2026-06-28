import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getClan } from "@/lib/bungie/clan";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  characterId: z.string(),
  isReady: z.boolean(),
  emblemPath: z.string().optional(),
  emblemBackgroundPath: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    // Character selection is critical — always update it first in its own call.
    const { error: selectionError } = await adminSupabase
      .from("lobby_members")
      .update({ is_ready: body.isReady, selected_character_id: body.characterId })
      .eq("lobby_id", body.lobbyId)
      .eq("user_id", session.userId);

    if (selectionError) throw new Error(selectionError.message);

    // Emblem paths are cosmetic — best-effort only. If the migration hasn't been
    // applied yet the update fails silently so character selection isn't blocked.
    if (body.emblemPath || body.emblemBackgroundPath) {
      await adminSupabase
        .from("lobby_members")
        .update({
          emblem_path: body.emblemPath ?? null,
          emblem_background_path: body.emblemBackgroundPath ?? null,
        })
        .eq("lobby_id", body.lobbyId)
        .eq("user_id", session.userId);
    }

    // Clan is cosmetic too — fetch from Bungie best-effort and store. Wrapped so
    // a Bungie hiccup or unapplied migration never blocks character selection.
    try {
      const token = await getBungieToken(session.userId);
      const clan = await getClan(session.bungieMembershipType, session.bungieMembershipId, token);
      await adminSupabase
        .from("lobby_members")
        .update({ clan_name: clan?.name ?? null, clan_tag: clan?.tag ?? null })
        .eq("lobby_id", body.lobbyId)
        .eq("user_id", session.userId);
    } catch {
      // ignore — nameplate just won't show a clan
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
