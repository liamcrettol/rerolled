import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getRawWeapons } from "@/lib/bungie/rawInventory";
import { getWeaponDefinitions } from "@/lib/bungie/definitions";
import { z } from "zod";
import type { WeaponSlot } from "@/types/bungie";

const schema = z.object({
  lobbyId: z.string().uuid(),
  characterId: z.string().optional(), // filter equippedHashes to this character
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, characterId } = schema.parse(await req.json());

    // Get all members
    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, bungie_membership_type, bungie_membership_id")
      .eq("lobby_id", lobbyId);

    if (!members?.length) {
      return NextResponse.json({ error: "No members found" }, { status: 404 });
    }

    // Fetch raw weapons for each member (no manifest needed)
    const memberWeaponMap = new Map<string, Awaited<ReturnType<typeof getRawWeapons>>>();

    const memberErrors: string[] = [];
    for (const member of members) {
      try {
        const token = await getBungieToken(member.user_id);
        const weapons = await getRawWeapons(
          member.bungie_membership_type,
          member.bungie_membership_id,
          token
        );
        memberWeaponMap.set(member.user_id, weapons);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`Skipping member ${member.user_id}:`, msg);
        memberErrors.push(msg);
      }
    }

    if (memberWeaponMap.size === 0) {
      const reason = memberErrors[0] ?? "Could not load any member inventories";
      return NextResponse.json({ error: reason }, { status: 500 });
    }

    // Compute intersection per slot
    // Solo: use own weapons as the pool (intersection of 1 = all)
    const slots: WeaponSlot[] = ["kinetic", "energy", "power"];
    const intersection: Record<WeaponSlot, number[]> = { kinetic: [], energy: [], power: [] };

    for (const slot of slots) {
      const memberHashSets: Set<number>[] = [];
      for (const weapons of Array.from(memberWeaponMap.values())) {
        const hashes = new Set<number>(weapons.filter((w) => w.slot === slot).map((w) => w.itemHash));
        memberHashSets.push(hashes);
      }
      if (memberHashSets.length === 0) continue;
      const [first, ...rest] = memberHashSets;
      intersection[slot] = Array.from(first).filter((h) => rest.every((s) => s.has(h)));
    }

    // Look up definitions only for the intersected hashes (fast — 3 parallel calls max per slot)
    const allHashes = [...new Set([
      ...intersection.kinetic,
      ...intersection.energy,
      ...intersection.power,
    ])];

    const defMap = await getWeaponDefinitions(allHashes);

    const weaponDetails: Record<string, { name: string; icon: string; weaponType: string; damageType: string; tierType: number }> = {};
    for (const [hash, def] of defMap.entries()) {
      weaponDetails[hash.toString()] = {
        name: def.name,
        icon: def.icon,
        weaponType: def.weaponType,
        damageType: def.damageType,
        tierType: def.tierType,
      };
    }

    // Return the requesting user's currently equipped weapon per slot
    // so the client can seed the initial roll with their current loadout.
    const myWeapons = memberWeaponMap.get(session.userId) ?? [];
    const equippedHashes: Record<WeaponSlot, number | null> = {
      kinetic: null,
      energy: null,
      power: null,
    };
    for (const slot of slots) {
      // Prefer the selected character's equipped weapon; fall back to any equipped
      const equipped =
        myWeapons.find((w) => w.slot === slot && w.isEquipped && (!characterId || w.characterId === characterId)) ??
        myWeapons.find((w) => w.slot === slot && w.isEquipped);
      if (equipped) {
        // Include even if not in intersection — will be used as seed; roll filters to pool
        equippedHashes[slot] = equipped.itemHash;
      }
    }

    return NextResponse.json({
      intersection,
      weaponDetails,
      memberCount: memberWeaponMap.size,
      equippedHashes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
