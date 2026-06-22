import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { rollLoadout } from "@/lib/roulette/intersection";
import { z } from "zod";
import type { WeaponSlot } from "@/types/bungie";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  intersection: z.object({
    kinetic: z.array(z.number()),
    energy: z.array(z.number()),
    power: z.array(z.number()),
  }),
  weaponDetails: z.record(z.string(), z.object({
    name: z.string(),
    icon: z.string(),
    weaponType: z.string(),
    damageType: z.string(),
  })),
  rerollSlot: z.enum(["kinetic", "energy", "power"]).optional(),
  keepSlots: z.object({
    kinetic: z.number().optional(),
    energy: z.number().optional(),
    power: z.number().optional(),
  }).optional(),
  wildcardSlots: z.array(z.enum(["kinetic", "energy", "power"])).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    // Verify caller is captain
    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("captain_user_id")
      .eq("id", body.lobbyId)
      .single();

    if (lobby?.captain_user_id !== session.userId) {
      return NextResponse.json({ error: "Only the captain can roll" }, { status: 403 });
    }

    const wildcards = new Set(body.wildcardSlots ?? []);

    // Upsert wildcard slots first (item_hash 0 = "everyone keeps their own")
    for (const slot of wildcards) {
      await adminSupabase.from("lobby_loadout_slots").upsert(
        {
          round_id: body.roundId,
          slot,
          item_hash: 0,
          weapon_name: "?",
          weapon_icon: "",
          weapon_type: "Any",
          damage_type: "Any",
          locked_by_user_id: session.userId,
        },
        { onConflict: "round_id,slot" }
      );
    }

    // Exclude wildcard slots from the random roll entirely
    const filteredIntersection = {
      kinetic: wildcards.has("kinetic") ? [] : body.intersection.kinetic,
      energy: wildcards.has("energy") ? [] : body.intersection.energy,
      power: wildcards.has("power") ? [] : body.intersection.power,
    };

    const exclude = body.rerollSlot
      ? { [body.rerollSlot]: undefined, ...Object.fromEntries(
          Object.entries(body.keepSlots ?? {}).filter(([, v]) => v !== undefined)
        ) }
      : body.keepSlots;

    const roll = rollLoadout(filteredIntersection, body.weaponDetails, exclude as Partial<Record<WeaponSlot, number>>);

    // Upsert rolled slots
    const slots: WeaponSlot[] = ["kinetic", "energy", "power"];
    for (const slot of slots) {
      if (wildcards.has(slot)) continue; // already written above
      const hash = roll[slot];
      if (!hash) continue;
      const detail = body.weaponDetails[hash.toString()];
      if (!detail) continue;

      await adminSupabase.from("lobby_loadout_slots").upsert(
        {
          round_id: body.roundId,
          slot,
          item_hash: hash,
          weapon_name: detail.name,
          weapon_icon: detail.icon,
          weapon_type: detail.weaponType,
          damage_type: detail.damageType,
          locked_by_user_id: session.userId,
        },
        { onConflict: "round_id,slot" }
      );
    }

    return NextResponse.json({ roll });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
