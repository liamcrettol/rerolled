import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { z } from "zod";

const slotMode = z.enum(["normal", "lock", "wildcard"]);

const settingsSchema = z.object({
  mode: z.enum(["normal", "chaos", "meta"]),
  rerollLimit: z.number().int().nullable(),
  noDup: z.boolean(),
  banned: z.array(z.string()),
  slots: z.object({
    kinetic: slotMode,
    energy: slotMode,
    power: slotMode,
  }),
});

const schema = z.object({
  lobbyId: z.string().uuid(),
  settings: settingsSchema,
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, settings } = schema.parse(await req.json());

    // Only the current captain can publish roll settings.
    const { data: member } = await adminSupabase
      .from("lobby_members")
      .select("is_captain")
      .eq("lobby_id", lobbyId)
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!member?.is_captain) {
      return NextResponse.json({ error: "Only the captain can change this" }, { status: 403 });
    }

    await adminSupabase
      .from("lobbies")
      .update({ roll_settings: settings })
      .eq("id", lobbyId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    if (status !== 401) console.error("[lobby/roll-settings] request failed:", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
