import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken, isBungieAuthErrorMessage } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getRawWeapons } from "@/lib/bungie/rawInventory";
import {
  applyWeapons,
  ensureInventorySpace,
  findBestInstance,
  type WeaponToApply,
} from "@/lib/bungie/equip";
import { getWeaponDefinition } from "@/lib/bungie/definitions";
import { transitionRun } from "@/lib/scoreAttack/runs";
import type { ApplyResult } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import { createLogger } from "@/lib/logger";
import { z } from "zod";

// Equip a run's rolled loadout onto the chosen character (#246). Mirrors the
// lobby apply flow minus the lobby bookkeeping, and records the character on
// the participant row — the detection jobs enqueued by the `applied`
// transition need it to poll the right character's activity history.
export const maxDuration = 60;

const schema = z.object({
  characterId: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = Date.now();
  let log = createLogger(req);
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const { data: run } = await adminSupabase
      .from("challenge_runs")
      .select("id, status, created_by")
      .eq("id", id)
      .maybeSingle();

    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (run.created_by !== session.userId) {
      return NextResponse.json({ error: "You do not own this run." }, { status: 403 });
    }
    // Re-apply while still in `applied` is allowed (e.g. a slot failed to equip).
    if (!["loadout_rolled", "applied"].includes(run.status)) {
      return NextResponse.json(
        { error: "This run is not waiting on a loadout apply." },
        { status: 409 }
      );
    }

    const { data: slots } = await adminSupabase
      .from("challenge_run_loadout_slots")
      .select("*")
      .eq("run_id", id);

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
    const missing: ApplyResult[] = [];
    for (const slot of slots) {
      if (slot.item_hash === 0) continue;
      const best = findBestInstance(slot.item_hash, myWeapons, body.characterId);
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
        slot: slot.slot as WeaponSlot,
        location: best.location,
        characterId: best.characterId,
      });
    }

    const loadoutInstanceIds = new Set(weaponsToApply.map((w) => w.itemInstanceId));
    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      weaponsToApply.length,
      loadoutInstanceIds
    );

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

    // Surface vault-clear results the same way the lobby apply route does —
    // otherwise a weapon getting vaulted to make room happens silently (#276).
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

    // Record the character before transitioning — the `applied` transition
    // reads it to enqueue the equipment-snapshot and activity-history jobs.
    await adminSupabase
      .from("challenge_run_participants")
      .update({ character_id: body.characterId })
      .eq("run_id", id)
      .eq("user_id", session.userId);

    if (run.status === "loadout_rolled") {
      const transition = await transitionRun({
        runId: id,
        userId: session.userId,
        next: "applied",
      });
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: transition.httpStatus ?? 500 });
      }
    }

    log.info("run.apply.done", {
      runId: id,
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      durationMs: Date.now() - t,
    });
    await log.flush();
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = isBungieAuthErrorMessage(msg) ? 401 : 500;
    log.error("run.apply.error", { error: msg, durationMs: Date.now() - t });
    await log.flush();
    return NextResponse.json({ error: msg }, { status });
  }
}
