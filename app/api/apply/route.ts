import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getRawWeapons, type RawWeapon } from "@/lib/bungie/rawInventory";
import { applyWeapons } from "@/lib/bungie/equip";
import type { WeaponToApply } from "@/lib/bungie/equip";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  characterId: z.string(),
});

function findBestInstance(itemHash: number, weapons: RawWeapon[], targetCharacterId: string): RawWeapon | null {
  const candidates = weapons.filter((w) => w.itemHash === itemHash);
  if (candidates.length === 0) return null;

  // Priority: on target char (0 transfers) > vault (1 transfer) > other char (2 transfers)
  // Within the same priority tier, prefer highest light level
  const transferCost = (w: RawWeapon) => {
    if (w.characterId === targetCharacterId) return 0;
    if (w.location === "vault") return 1;
    return 2;
  };

  return candidates.sort((a, b) => {
    const costDiff = transferCost(a) - transferCost(b);
    return costDiff !== 0 ? costDiff : b.lightLevel - a.lightLevel;
  })[0];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("*")
      .eq("round_id", body.roundId);

    if (!slots?.length) {
      return NextResponse.json({ error: "No loadout rolled yet" }, { status: 400 });
    }

    const token = await getBungieToken(session.userId);
    const myWeapons = await getRawWeapons(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );

    const weaponsToApply: WeaponToApply[] = [];
    for (const slot of slots) {
      if (slot.item_hash === 0) continue; // wildcard — player keeps their own weapon
      const best = findBestInstance(slot.item_hash, myWeapons, body.characterId);
      if (!best) continue;
      weaponsToApply.push({
        itemHash: best.itemHash,
        itemInstanceId: best.itemInstanceId,
        slot: slot.slot as "kinetic" | "energy" | "power",
        location: best.location,
        characterId: best.characterId,
      });
    }

    const results = await applyWeapons(
      weaponsToApply,
      body.characterId,
      session.bungieMembershipType,
      token,
      session.userId,
      session.displayName
    );

    await adminSupabase.from("roll_history").upsert(
      {
        lobby_id: body.lobbyId,
        round_id: body.roundId,
        round_number: 0,
        applied_at: new Date().toISOString(),
        apply_results: results,
      },
      { onConflict: "round_id" }
    );

    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
