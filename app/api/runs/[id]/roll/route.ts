import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getWeapons } from "@/lib/bungie/inventory";
import { rollLoadout } from "@/lib/roulette/intersection";
import { seededRng } from "@/lib/roulette/seededRng";
import { rerollCountFromRules } from "@/lib/challenges/present";
import { applyRollRules } from "@/lib/challenges/rollRules";
import { transitionRun } from "@/lib/scoreAttack/runs";
import type { WeaponSlot } from "@/types/bungie";
import type { WeeklyChallengeRuleSet } from "@/types/challenges";
import { createLogger } from "@/lib/logger";

// Roll (or reroll) the 3-slot loadout for a solo run (#246/#252). Unlike the
// lobby roll, the pool is the owner's own inventory, built server-side from
// Bungie — there is no client-submitted pool to validate. Weekly runs enforce
// the published ruleset on the pool (lib/challenges/rollRules.ts) and roll
// with a deterministic RNG seeded from the week's global_seed, so restarting
// a run re-rolls the same guns instead of granting infinite rerolls. Slots
// land in challenge_run_loadout_slots, which the scoring/compliance workers
// read.
export const maxDuration = 60;

// Score Attack allows a couple of mulligans before the run starts; weekly runs
// use the reroll allowance published in the challenge ruleset.
const SCORE_ATTACK_REROLL_LIMIT = 2;

const SLOTS: WeaponSlot[] = ["kinetic", "energy", "power"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t = Date.now();
  let log = createLogger(req);
  try {
    const session = await requireSession();
    log = createLogger(req, session.userId);
    const { id } = await ctx.params;

    const { data: run } = await adminSupabase
      .from("challenge_runs")
      .select("id, mode, status, created_by, weekly_challenge_id")
      .eq("id", id)
      .maybeSingle();

    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (run.created_by !== session.userId) {
      return NextResponse.json({ error: "You do not own this run." }, { status: 403 });
    }
    if (!["created", "loadout_rolled"].includes(run.status)) {
      return NextResponse.json(
        { error: "The loadout is locked once the run is underway." },
        { status: 409 }
      );
    }

    let rerollLimit = SCORE_ATTACK_REROLL_LIMIT;
    let weeklyRules: WeeklyChallengeRuleSet | null = null;
    let globalSeed: string | null = null;
    if (run.mode === "weekly_challenge" && run.weekly_challenge_id) {
      const { data: challenge } = await adminSupabase
        .from("weekly_challenges")
        .select("rules, ends_at, global_seed")
        .eq("id", run.weekly_challenge_id)
        .maybeSingle();
      if (challenge && new Date(challenge.ends_at).getTime() <= Date.now()) {
        return NextResponse.json({ error: "This weekly challenge has ended." }, { status: 409 });
      }
      rerollLimit = rerollCountFromRules(challenge?.rules);
      weeklyRules = challenge?.rules ?? null;
      globalSeed = challenge?.global_seed ?? null;
    }

    const { data: existingSlots } = await adminSupabase
      .from("challenge_run_loadout_slots")
      .select("slot, item_hash, reroll_count")
      .eq("run_id", id);

    const isReroll = (existingSlots?.length ?? 0) > 0;
    const rerollsUsed = isReroll
      ? Math.max(...existingSlots!.map((s) => s.reroll_count ?? 0))
      : 0;
    if (isReroll && rerollsUsed >= rerollLimit) {
      return NextResponse.json({ error: "No rerolls left for this run." }, { status: 409 });
    }

    // Build the roll pool from the owner's full inventory (character + vault).
    const token = await getBungieToken(session.userId);
    const weapons = await getWeapons(
      session.bungieMembershipType,
      session.bungieMembershipId,
      token
    );

    const pools: Record<WeaponSlot, number[]> = { kinetic: [], energy: [], power: [] };
    const details: Record<
      string,
      { name: string; icon: string; weaponType: string; damageType: string; ammoType?: string; tierType?: number }
    > = {};
    for (const w of weapons) {
      if (!details[w.itemHash.toString()]) {
        pools[w.slot].push(w.itemHash);
        details[w.itemHash.toString()] = {
          name: w.name,
          icon: w.icon,
          weaponType: w.weaponType,
          damageType: w.damageType,
          ammoType: w.ammoType,
          tierType: w.tierType,
        };
      }
    }
    if (SLOTS.every((s) => pools[s].length === 0)) {
      return NextResponse.json({ error: "No weapons found in your inventory." }, { status: 400 });
    }

    const nextRerollCount = isReroll ? rerollsUsed + 1 : 0;

    // Weekly rolls are deterministic per (week, player, reroll) — restarting a
    // run re-rolls the same guns, so abandoning isn't a free reroll.
    const rng = globalSeed
      ? seededRng(`${globalSeed}:${session.userId}:${nextRerollCount}`)
      : Math.random;

    // Weekly ruleset shapes the pool before the roll (#252). Unsatisfiable
    // rules refuse the roll rather than hand out a rule-breaking loadout.
    let rollPools = pools;
    let wildcardSlots: WeaponSlot[] = [];
    if (weeklyRules) {
      const shaped = applyRollRules({ pools, details, rules: weeklyRules, rng });
      if (shaped.unsatisfiable.length > 0) {
        return NextResponse.json({ error: shaped.unsatisfiable.join(" ") }, { status: 409 });
      }
      rollPools = shaped.pools;
      wildcardSlots = shaped.wildcardSlots;
      // Wildcard slots aren't rolled — the player keeps their own weapon there.
      for (const slot of wildcardSlots) rollPools[slot] = [];
    }

    // On a reroll, avoid handing back the guns that were just rolled.
    const avoid: Partial<Record<WeaponSlot, number[]>> = {};
    for (const s of existingSlots ?? []) {
      avoid[s.slot as WeaponSlot] = [s.item_hash];
    }

    const roll = rollLoadout(rollPools, details, undefined, isReroll ? avoid : undefined, "normal", rng);
    const loadout: Array<{
      slot: WeaponSlot;
      itemHash: number;
      name: string;
      icon: string;
      weaponType: string;
      damageType: string;
    }> = [];
    for (const slot of SLOTS) {
      // Wildcard slot (weekly rule): item_hash 0 = "bring your own weapon".
      if (wildcardSlots.includes(slot)) {
        await adminSupabase.from("challenge_run_loadout_slots").upsert(
          {
            run_id: id,
            slot,
            item_hash: 0,
            weapon_name: "?",
            weapon_icon: "",
            weapon_type: "Any",
            damage_type: "Any",
            is_wildcard: true,
            reroll_count: nextRerollCount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "run_id,slot" }
        );
        loadout.push({
          slot,
          itemHash: 0,
          name: "Your choice",
          icon: "",
          weaponType: "Any",
          damageType: "Any",
        });
        continue;
      }

      const hash = roll[slot];
      if (!hash) continue;
      const detail = details[hash.toString()];
      if (!detail) continue;

      await adminSupabase.from("challenge_run_loadout_slots").upsert(
        {
          run_id: id,
          slot,
          item_hash: hash,
          weapon_name: detail.name,
          weapon_icon: detail.icon,
          weapon_type: detail.weaponType,
          damage_type: detail.damageType,
          reroll_count: nextRerollCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "run_id,slot" }
      );
      loadout.push({
        slot,
        itemHash: hash,
        name: detail.name,
        icon: detail.icon,
        weaponType: detail.weaponType,
        damageType: detail.damageType,
      });
    }

    if (run.status === "created") {
      const transition = await transitionRun({
        runId: id,
        userId: session.userId,
        next: "loadout_rolled",
      });
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: transition.httpStatus ?? 500 });
      }
    }

    log.info("run.roll.done", { runId: id, mode: run.mode, isReroll, rerollsUsed: nextRerollCount, durationMs: Date.now() - t });
    await log.flush();
    return NextResponse.json({ loadout, rerollsUsed: nextRerollCount, rerollLimit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    log.error("run.roll.error", { error: msg, durationMs: Date.now() - t });
    await log.flush();
    return NextResponse.json({ error: msg }, { status });
  }
}
