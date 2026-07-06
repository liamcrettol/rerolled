import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getRawWeapons } from "@/lib/bungie/rawInventory";
import {
  applyWeapons,
  ensureInventorySpace,
  findBestInstance,
  type WeaponToApply,
} from "@/lib/bungie/equip";
import { getDraftState } from "@/lib/draft/service";
import { getPicksForUser, isUserLoadoutComplete, SLOT_ORDER } from "@/lib/draft/session";
import type { ApplyResult } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import { z } from "zod";

const schema = z.object({ characterId: z.string() });

// Equips the caller's own completed draft picks via the same Bungie equip
// pipeline roulette uses (#264). Draft has no shared round/roll_history
// bookkeeping — each fireteam member applies their own drafted loadout
// whenever their picks are complete.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { characterId } = schema.parse(await req.json());

    const draft = await getDraftState(id);
    if (!draft.ok || !draft.state) {
      return NextResponse.json({ error: draft.error ?? "Draft session not found" }, { status: 404 });
    }
    const { data: draftSession } = await adminSupabase
      .from("draft_sessions")
      .select("lobby_id")
      .eq("id", id)
      .single();
    if (!isUserLoadoutComplete(draft.state, session.userId)) {
      return NextResponse.json(
        { error: "Your draft picks aren't complete yet" },
        { status: 400 }
      );
    }

    const picks = getPicksForUser(draft.state, session.userId);
    const token = await getBungieToken(session.userId);
    const myWeapons = await getRawWeapons(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );

    const weaponsToApply: WeaponToApply[] = [];
    const missing: ApplyResult[] = [];
    for (const slot of SLOT_ORDER) {
      const itemHash = picks[slot];
      if (itemHash === undefined) continue;
      const best = findBestInstance(itemHash, myWeapons, characterId);
      if (!best) {
        missing.push({
          user_id: session.userId,
          display_name: session.displayName,
          slot: slot as WeaponSlot,
          item_hash: itemHash,
          success: false,
          error: "Not in inventory - pull it from Collections in-game, then Apply again",
        });
        continue;
      }
      weaponsToApply.push({
        itemHash: best.itemHash,
        itemInstanceId: best.itemInstanceId,
        slot,
        location: best.location,
        characterId: best.characterId,
      });
    }

    const loadoutInstanceIds = new Set(weaponsToApply.map((w) => w.itemInstanceId));
    await ensureInventorySpace(
      characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      weaponsToApply.length,
      loadoutInstanceIds
    );

    const equipResults = await applyWeapons(
      weaponsToApply,
      characterId,
      session.bungieMembershipType,
      token,
      session.userId,
      session.displayName,
      myWeapons
    );

    if (draftSession?.lobby_id) {
      await adminSupabase
        .from("lobbies")
        .update({ status: "in_game", last_active_at: new Date().toISOString() })
        .eq("id", draftSession.lobby_id);
    }

    return NextResponse.json({ results: [...equipResults, ...missing] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
