import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getRawWeapons, type RawWeapon } from "@/lib/bungie/rawInventory";
import {
  applyWeapons,
  ensureInventorySpace,
  type InventoryClearResult,
  type WeaponToApply,
} from "@/lib/bungie/equip";
import { getWeaponDefinition } from "@/lib/bungie/definitions";
import type { ApplyResult } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import { rotateCaptain } from "@/lib/lobby";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  characterId: z.string(),
  // Captain-chosen instanceId per slot (overrides findBestInstance heuristic)
  preferredInstances: z.record(z.string(), z.string()).optional(),
});

function findBestInstance(
  itemHash: number,
  weapons: RawWeapon[],
  targetCharacterId: string,
  preferredInstanceId?: string
): RawWeapon | null {
  const candidates = weapons.filter((w) => w.itemHash === itemHash);
  if (candidates.length === 0) return null;

  // Honor captain's chosen roll if it exists in this user's inventory
  if (preferredInstanceId) {
    const preferred = candidates.find((w) => w.itemInstanceId === preferredInstanceId);
    if (preferred) return preferred;
  }

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
    const preferredInstances = body.preferredInstances ?? {};

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
    // Slots whose weapon isn't in this player's inventory/vault. The only way
    // that happens here is a Collections-only exotic (the intersection lets the
    // captain pick those). Bungie has no "pull from Collections" API, so we
    // can't auto-equip it - surface a clear message instead of silently
    // skipping the slot.
    const missing: ApplyResult[] = [];
    for (const slot of slots) {
      if (slot.item_hash === 0) continue; // wildcard - player keeps their own weapon
      const best = findBestInstance(slot.item_hash, myWeapons, body.characterId, preferredInstances[slot.slot]);
      if (!best) {
        missing.push({
          user_id: session.userId,
          display_name: session.displayName,
          slot: slot.slot as WeaponSlot,
          item_hash: slot.item_hash,
          success: false,
          error: `Not in inventory - pull ${slot.weapon_name} from Collections in-game, then Apply again`,
          weapon_name: slot.weapon_name,
          weapon_icon: slot.weapon_icon,
        });
        continue;
      }
      weaponsToApply.push({
        itemHash: best.itemHash,
        itemInstanceId: best.itemInstanceId,
        slot: slot.slot as "kinetic" | "energy" | "power",
        location: best.location,
        characterId: best.characterId,
      });
    }

    // Build set of instance IDs we're about to equip - don't vault these!
    const loadoutInstanceIds = new Set(weaponsToApply.map((w) => w.itemInstanceId));

    // Proactively ensure inventory has space for incoming weapons.
    // If this fails, applyWeapons still has fallback retry logic to vault additional items.
    // Non-fatal failures here are reported in the response but don't block equipping.
    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      weaponsToApply.length, // Pass actual loadout size for intelligent calculation
      loadoutInstanceIds
    );

    // Update roster after vaulting to reflect space made
    const rosterAfterClearing = myWeapons.filter(
      (w) => !clearResults.find((r) => r.itemInstanceId === w.itemInstanceId)
    );

    const equipResults = await applyWeapons(
      weaponsToApply,
      body.characterId,
      session.bungieMembershipType,
      token,
      session.userId,
      session.displayName,
      rosterAfterClearing
    );

    const clearResultsEnriched = await Promise.all(
      clearResults.map(async (r) => {
        const def = await getWeaponDefinition(r.itemHash);
        return {
          user_id: session.userId,
          display_name: session.displayName,
          slot: "kinetic" as WeaponSlot, // vault operations don't have a specific slot
          item_hash: r.itemHash,
          success: r.success,
          error: r.error ? `Vaulted to make room: ${r.error}` : undefined,
          error_detail: r.error,
          weapon_name: def?.name,
          weapon_icon: def?.icon,
          kind: "vault" as const,
        };
      })
    );

    const results = [...clearResultsEnriched, ...equipResults, ...missing];

    // One roll_history row per round, updated on re-apply.
    // NOTE: roll_history has no unique constraint on round_id, so we can't use
    // upsert/onConflict here - do an explicit select-then-update/insert instead.
    const appliedAt = new Date().toISOString();
    const [{ data: existingHistory }, { data: roundRow }] = await Promise.all([
      adminSupabase.from("roll_history").select("id").eq("round_id", body.roundId).maybeSingle(),
      adminSupabase.from("lobby_rounds").select("round_number").eq("id", body.roundId).maybeSingle(),
    ]);
    const roundNumber = roundRow?.round_number ?? 0;

    if (existingHistory) {
      await adminSupabase
        .from("roll_history")
        .update({ applied_at: appliedAt, apply_results: results })
        .eq("id", existingHistory.id);
    } else {
      await adminSupabase.from("roll_history").insert({
        lobby_id: body.lobbyId,
        round_id: body.roundId,
        round_number: roundNumber,
        applied_at: appliedAt,
        apply_results: results,
      });
    }

    // Best-effort: update status + last_active_at (requires migration 008).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminSupabase.from("lobbies").update({ status: "in_game", last_active_at: appliedAt } as any).eq("id", body.lobbyId);

    // Track that this player applied and check if captain should rotate.
    // The RPC atomically appends the player and returns true only for the
    // first caller who completes the full fireteam (race guard).
    const { data: shouldRotate } = await adminSupabase.rpc("mark_player_applied", {
      p_round_id: body.roundId,
      p_user_id: session.userId,
      p_lobby_id: body.lobbyId,
    });

    if (shouldRotate) {
      const { data: lobbyRow } = await adminSupabase
        .from("lobbies")
        .select("captain_locked")
        .eq("id", body.lobbyId)
        .single();

      if (!lobbyRow?.captain_locked) {
        await rotateCaptain(body.lobbyId);
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
