import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { recordPick } from "@/lib/draft/service";
import { z } from "zod";
import type { WeaponSlot } from "@/types/bungie";

const schema = z.object({ itemHash: z.number().int().positive() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { itemHash } = schema.parse(await req.json());

    const { data: draftSession } = await adminSupabase
      .from("draft_sessions")
      .select("lobby_id")
      .eq("id", id)
      .single();
    if (!draftSession) {
      return NextResponse.json({ error: "Draft session not found" }, { status: 404 });
    }

    // Validate against the same server-owned intersection pool roulette uses
    // (#238) so a pick can't hand someone a weapon nobody in the fireteam owns.
    const { data: cachedPool } = await adminSupabase
      .from("lobby_pools")
      .select("pool")
      .eq("lobby_id", draftSession.lobby_id)
      .single();
    const pool = cachedPool?.pool as Partial<Record<WeaponSlot, number[]>> | undefined;

    const result = await recordPick(id, session.userId, itemHash, pool);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ complete: result.complete });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
