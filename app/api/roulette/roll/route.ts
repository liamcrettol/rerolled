import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { rollLoadout } from "@/lib/roulette/intersection";
import { z } from "zod";
import type { WeaponSlot } from "@/types/bungie";
import { createLogger } from "@/lib/logger";

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
    ammoType: z.string().optional(),
    tierType: z.number().optional(),
    stats: z.record(z.string(), z.number()).optional(),
  })),
  rerollSlot: z.enum(["kinetic", "energy", "power"]).optional(),
  keepSlots: z.object({
    kinetic: z.number().optional(),
    energy: z.number().optional(),
    power: z.number().optional(),
  }).optional(),
  // Recent rolls per slot (most-recent first), to avoid repeating a gun that
  // came up in the last few rolls.
  avoid: z.object({
    kinetic: z.array(z.number()).optional(),
    energy: z.array(z.number()).optional(),
    power: z.array(z.number()).optional(),
  }).optional(),
  wildcardSlots: z.array(z.enum(["kinetic", "energy", "power"])).optional(),
  mode: z.enum(["normal", "chaos", "meta"]).optional(),
  nodup: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const t = Date.now();
  let log = createLogger(req);
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);
    const body = schema.parse(await req.json());
    log.info("roll.start", { lobbyId: body.lobbyId, roundId: body.roundId, mode: body.mode ?? "normal", rerollSlot: body.rerollSlot ?? null, wildcardSlots: body.wildcardSlots ?? [] });

    // Verify caller is captain
    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("captain_user_id")
      .eq("id", body.lobbyId)
      .single();

    if (lobby?.captain_user_id !== session.userId) {
      log.warn("roll.forbidden", { lobbyId: body.lobbyId, captainId: lobby?.captain_user_id });
      await log.flush();
      return NextResponse.json({ error: "Only the captain can roll" }, { status: 403 });
    }

    // No-duplicates mode: exclude every weapon rolled in a previous round.
    // If the subtraction would empty a slot's pool, that slot's pool resets
    // (i.e. when all weapons have been seen, the cycle starts over).
    let filteredByHistory = { ...body.intersection };
    if (body.nodup) {
      const { data: prevSlots } = await adminSupabase
        .from("lobby_loadout_slots")
        .select("slot, item_hash, lobby_rounds!inner(lobby_id)")
        .eq("lobby_rounds.lobby_id", body.lobbyId)
        .neq("round_id", body.roundId)
        .neq("item_hash", 0);

      const used: Record<string, Set<number>> = { kinetic: new Set(), energy: new Set(), power: new Set() };
      for (const row of prevSlots ?? []) {
        used[row.slot]?.add(row.item_hash);
      }

      for (const slot of ["kinetic", "energy", "power"] as const) {
        const original = body.intersection[slot];
        const filtered = original.filter((h) => !used[slot].has(h));
        // Reset if we've exhausted the pool; otherwise use the filtered list.
        filteredByHistory[slot] = filtered.length > 0 ? filtered : original;
      }
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
      kinetic: wildcards.has("kinetic") ? [] : filteredByHistory.kinetic,
      energy: wildcards.has("energy") ? [] : filteredByHistory.energy,
      power: wildcards.has("power") ? [] : filteredByHistory.power,
    };

    const exclude = body.rerollSlot
      ? { [body.rerollSlot]: undefined, ...Object.fromEntries(
          Object.entries(body.keepSlots ?? {}).filter(([, v]) => v !== undefined)
        ) }
      : body.keepSlots;

    const roll = rollLoadout(
      filteredIntersection,
      body.weaponDetails,
      exclude as Partial<Record<WeaponSlot, number>>,
      body.avoid as Partial<Record<WeaponSlot, number[]>> | undefined,
      body.mode
    );

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

    // Best-effort: update status + last_active_at (requires migration 008).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminSupabase.from("lobbies").update({ status: "rolling", last_active_at: new Date().toISOString() } as any).eq("id", body.lobbyId);

    log.info("roll.done", { lobbyId: body.lobbyId, roundId: body.roundId, roll, durationMs: Date.now() - t });
    await log.flush();
    return NextResponse.json({ roll });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("roll.error", { error: msg, durationMs: Date.now() - t });
    await log.flush();
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
