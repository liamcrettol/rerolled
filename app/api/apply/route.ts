import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken, isBungieAuthErrorMessage } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getCharacters } from "@/lib/bungie/inventory";
import { getRawWeapons } from "@/lib/bungie/rawInventory";
import {
  applyWeapons,
  ensureInventorySpace,
  findBestInstance,
  type InventoryClearResult,
  type WeaponToApply,
} from "@/lib/bungie/equip";
import { getWeaponDefinition } from "@/lib/bungie/definitions";
import type { ApplyResult } from "@/types/lobby";
import type { DestinyCharacter, WeaponSlot } from "@/types/bungie";
import { rotateCaptain } from "@/lib/lobby";
import { createLogger } from "@/lib/logger";
import { z } from "zod";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  characterId: z.string(),
  // Captain-chosen instanceId per slot (overrides findBestInstance heuristic)
  preferredInstances: z.record(z.string(), z.string()).optional(),
});

function mostRecentlyPlayedCharacter(characters: DestinyCharacter[]): DestinyCharacter | null {
  return [...characters].sort((a, b) => {
    const aTime = new Date(a.dateLastPlayed).getTime();
    const bTime = new Date(b.dateLastPlayed).getTime();
    return bTime - aTime;
  })[0] ?? null;
}

export async function POST(req: NextRequest) {
  const t = Date.now();
  let log: ReturnType<typeof createLogger> = createLogger(req);
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);
    const body = schema.parse(await req.json());
    const preferredInstances = body.preferredInstances ?? {};

    const { data: slots } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("*")
      .eq("round_id", body.roundId);

    if (!slots?.length) {
      await log.flush();
      return NextResponse.json({ error: "No loadout rolled yet" }, { status: 400 });
    }

    const token = await getBungieToken(session.userId, session.bungieMembershipId);
    const characters = await getCharacters(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );
    const latestCharacter = mostRecentlyPlayedCharacter(characters);
    const characterId = latestCharacter?.characterId ?? body.characterId;

    log.info("apply.start", {
      lobbyId: body.lobbyId,
      roundId: body.roundId,
      requestedCharacterId: body.characterId,
      characterId,
    });

    // The client may have selected a character before the user switched in-game.
    // Apply should follow Bungie's fresh most-recently-played character and then
    // persist that selection back onto the lobby member row for the UI/stat path.
    const memberPatch = latestCharacter
      ? {
          is_ready: true,
          selected_character_id: characterId,
          emblem_path: latestCharacter.emblemPath,
          emblem_background_path: latestCharacter.emblemBackgroundPath,
        }
      : { is_ready: true, selected_character_id: characterId };
    await adminSupabase
      .from("lobby_members")
      .update(memberPatch)
      .eq("lobby_id", body.lobbyId)
      .eq("user_id", session.userId);

    const myWeapons = await getRawWeapons(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );

    const weaponsToApply: WeaponToApply[] = [];
    // Slots whose weapon isn't in this player's inventory/vault. The only way
    // that happens here is a Collections-only exotic (the intersection lets the
    // captain pick those). Bungie has no "pull from Collections" API, so we
    // can't auto-equip it. Surface a clear message instead of silently
    // skipping the slot.
    const missing: ApplyResult[] = [];
    for (const slot of slots) {
      if (slot.item_hash === 0) continue; // wildcard - player keeps their own weapon
      const best = findBestInstance(slot.item_hash, myWeapons, characterId, preferredInstances[slot.slot]);
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
      characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      weaponsToApply.length, // Pass actual loadout size for intelligent calculation
      loadoutInstanceIds
    );

    if (clearResults.length > 0) {
      log.info("apply.inventory_cleared", { lobbyId: body.lobbyId, count: clearResults.length, durationMs: Date.now() - t });
    }

    // Update roster after vaulting to reflect space made
    const rosterAfterClearing = myWeapons.filter(
      (w) => !clearResults.find((r) => r.itemInstanceId === w.itemInstanceId)
    );

    const equipResults = await applyWeapons(
      weaponsToApply,
      characterId,
      session.bungieMembershipType,
      token,
      session.userId,
      session.displayName,
      rosterAfterClearing
    );

    const clearResultsEnriched = await Promise.all(
      clearResults.map(async (r: InventoryClearResult) => {
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

    // One roll_history row per round, updated on re-apply. round_id has a
    // unique constraint (migration 023), so concurrent applies from different
    // fireteam members race safely through upsert instead of both inserting.
    const appliedAt = new Date().toISOString();
    const { data: roundRow } = await adminSupabase
      .from("lobby_rounds")
      .select("round_number")
      .eq("id", body.roundId)
      .maybeSingle();
    const roundNumber = roundRow?.round_number ?? 0;

    await adminSupabase.from("roll_history").upsert(
      {
        lobby_id: body.lobbyId,
        round_id: body.roundId,
        round_number: roundNumber,
        applied_at: appliedAt,
        apply_results: results,
      },
      { onConflict: "round_id" }
    );

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

    log.info("apply.done", { lobbyId: body.lobbyId, roundId: body.roundId, total: results.length, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, durationMs: Date.now() - t });
    await log.flush();
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = isBungieAuthErrorMessage(msg) ? 401 : 500;
    log.error("apply.error", { error: msg, durationMs: Date.now() - t }); await log.flush();
    return NextResponse.json({ error: msg }, { status });
  }
}
