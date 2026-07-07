import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, getBungieToken, isBungieAuthErrorMessage } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { bungieGet, getInventoryItemDefinitions } from "@/lib/bungie/client";
import { rollLoadout } from "@/lib/roulette/intersection";
import {
  pickEndgameActivity,
  selectExoticArmorOptions,
  collectEndgameArmorCandidateHashes,
  ARMOR_BUCKET_HASHES,
  ENDGAME_KIND_FIRETEAM_SIZE,
  type EndgameActivityKind,
  type ExoticArmorChoice,
} from "@/lib/endgame/randomizer";
import type { BungieProfileResponse, WeaponSlot } from "@/types/bungie";

const schema = z.object({
  lobbyId: z.string().uuid(),
  roundId: z.string().uuid(),
  activityKinds: z.array(z.enum(["grandmaster", "dungeon", "raid"])).min(1),
  force: z.boolean().optional(),
});

// 200 Characters · 201 CharacterInventories · 205 CharacterEquipment ·
// 102 ProfileInventories - same set the solo endgame roll route uses, enough
// to locate every armor candidate across every character + the vault.
const PROFILE_COMPONENTS = [200, 201, 205, 102].join(",");
const ARMOR_BUCKET_LIST: number[] = Object.values(ARMOR_BUCKET_HASHES);

type PickStatus = "resolved" | "none_owned" | "fetch_failed" | "missing_character" | "missing_token";

interface PickOutcome {
  user_id: string;
  status: PickStatus;
  choice?: ExoticArmorChoice;
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const activityKinds = [...new Set(body.activityKinds)] as EndgameActivityKind[];

    const { data: lobby } = await adminSupabase
      .from("lobbies")
      .select("captain_user_id")
      .eq("id", body.lobbyId)
      .single();

    if (lobby?.captain_user_id !== session.userId) {
      return NextResponse.json({ error: "Only the captain can roll" }, { status: 403 });
    }

    // Idempotent unless forced - a reroll is an explicit captain action, not
    // an accidental re-click.
    const { data: existingRound } = await adminSupabase
      .from("lobby_endgame_rounds")
      .select("*")
      .eq("round_id", body.roundId)
      .maybeSingle();

    if (existingRound && !body.force) {
      const { data: existingPicks } = await adminSupabase
        .from("lobby_endgame_exotic_picks")
        .select("*")
        .eq("round_id", body.roundId);
      return NextResponse.json({ round: existingRound, picks: existingPicks ?? [] });
    }

    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, display_name, bungie_membership_type, bungie_membership_id, selected_character_id")
      .eq("lobby_id", body.lobbyId)
      .eq("is_spectator", false)
      .eq("is_ready", true);

    const roster = members ?? [];
    if (roster.length === 0) {
      return NextResponse.json({ error: "No ready players in this lobby." }, { status: 400 });
    }

    // Hard size gate, re-checked server-side (client already disables kinds
    // that don't match).
    for (const kind of activityKinds) {
      if (ENDGAME_KIND_FIRETEAM_SIZE[kind] !== roster.length) {
        return NextResponse.json(
          {
            error: `${kind} needs exactly ${ENDGAME_KIND_FIRETEAM_SIZE[kind]} ready players. This lobby has ${roster.length}.`,
          },
          { status: 400 }
        );
      }
    }

    // Shared weapon loadout from the same cached lobby intersection
    // /api/roulette/roll reads from.
    const { data: poolRow } = await adminSupabase
      .from("lobby_pools")
      .select("pool, weapon_details")
      .eq("lobby_id", body.lobbyId)
      .single();

    if (!poolRow?.pool) {
      return NextResponse.json(
        { error: "The shared weapon pool isn't ready yet. Open the weapon browser first." },
        { status: 409 }
      );
    }

    const roll = rollLoadout(poolRow.pool, poolRow.weapon_details ?? {});
    const slots: WeaponSlot[] = ["kinetic", "energy", "power"];
    for (const slot of slots) {
      if (!roll[slot]) {
        return NextResponse.json({ error: `Couldn't roll a ${slot} weapon from the shared pool.` }, { status: 409 });
      }
    }

    const activity = pickEndgameActivity(activityKinds);
    const exoticBucketHash = ARMOR_BUCKET_LIST[Math.floor(Math.random() * ARMOR_BUCKET_LIST.length)];

    // Promise.allSettled: one member's Bungie hiccup shouldn't sink the roll
    // for everyone else - each member gets their own outcome/status instead.
    const settled = await Promise.allSettled(
      roster.map(async (member): Promise<PickOutcome> => {
        if (!member.selected_character_id) {
          return { user_id: member.user_id, status: "missing_character" };
        }

        let token: string;
        try {
          token = await getBungieToken(member.user_id, member.bungie_membership_id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { user_id: member.user_id, status: isBungieAuthErrorMessage(msg) ? "missing_token" : "fetch_failed" };
        }

        try {
          const profile = await bungieGet<BungieProfileResponse>(
            `/Destiny2/${member.bungie_membership_type}/Profile/${member.bungie_membership_id}/?components=${PROFILE_COMPONENTS}`,
            token
          );
          const candidateHashes = collectEndgameArmorCandidateHashes(
            profile,
            member.selected_character_id,
            exoticBucketHash
          );
          const armorDefinitions = await getInventoryItemDefinitions(candidateHashes, token);
          const { options } = selectExoticArmorOptions(
            profile,
            armorDefinitions,
            member.selected_character_id,
            exoticBucketHash
          );

          if (options.length === 0) {
            return { user_id: member.user_id, status: "none_owned" };
          }
          const choice = options[Math.floor(Math.random() * options.length)];
          return { user_id: member.user_id, status: "resolved", choice };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { user_id: member.user_id, status: isBungieAuthErrorMessage(msg) ? "missing_token" : "fetch_failed" };
        }
      })
    );

    // Write order: weapons, then the shared round row, then per-member picks
    // (clearing stale rows first on a forced reroll, so a shrunk roster
    // doesn't leave last round's picks behind for someone no longer ready).
    for (const slot of slots) {
      const hash = roll[slot]!;
      const detail = poolRow.weapon_details?.[hash.toString()];
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

    const { data: roundRow, error: roundError } = await adminSupabase
      .from("lobby_endgame_rounds")
      .upsert(
        {
          round_id: body.roundId,
          activity_hash: activity.activityHash,
          activity_name: activity.name,
          activity_kind: activity.kind,
          exotic_bucket_hash: exoticBucketHash,
        },
        { onConflict: "round_id" }
      )
      .select()
      .single();

    if (roundError || !roundRow) {
      return NextResponse.json({ error: roundError?.message ?? "Failed to save the round" }, { status: 500 });
    }

    if (body.force) {
      await adminSupabase.from("lobby_endgame_exotic_picks").delete().eq("round_id", body.roundId);
    }

    const pickRows = settled.map((result, i) => {
      const member = roster[i];
      const outcome: PickOutcome =
        result.status === "fulfilled" ? result.value : { user_id: member.user_id, status: "fetch_failed" };

      if (outcome.status === "resolved" && outcome.choice) {
        const c = outcome.choice;
        return {
          round_id: body.roundId,
          user_id: outcome.user_id,
          status: "resolved",
          item_hash: c.itemHash,
          item_instance_id: c.itemInstanceId,
          name: c.name,
          icon: c.icon,
          class_type: c.classType,
          slot_label: c.slotLabel,
          location: c.location,
          character_id: c.characterId ?? member.selected_character_id,
          is_equipped: c.isEquipped,
        };
      }
      return {
        round_id: body.roundId,
        user_id: outcome.user_id,
        status: outcome.status,
        character_id: member.selected_character_id,
      };
    });

    const { data: pickResult, error: picksError } = await adminSupabase
      .from("lobby_endgame_exotic_picks")
      .upsert(pickRows, { onConflict: "round_id,user_id" })
      .select();

    if (picksError) {
      return NextResponse.json({ error: picksError.message }, { status: 500 });
    }

    return NextResponse.json({ round: roundRow, picks: pickResult ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
