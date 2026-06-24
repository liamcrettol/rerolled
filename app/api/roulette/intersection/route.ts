import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import {
  getWeaponDefinitions,
  getPerkNames,
  getPerkIcons,
  flushDefinitionCache,
} from "@/lib/bungie/definitions";
import { bungieGet } from "@/lib/bungie/client";
import { z } from "zod";
import type { WeaponSlot } from "@/types/bungie";
import { bucketToSlot } from "@/types/bungie";

const schema = z.object({
  lobbyId: z.string().uuid(),
  characterId: z.string().optional(),
});

// Single combined fetch per member. Component 305 (ItemSockets) is the heaviest
// part of the payload and is only needed for the caller (to show their perks), so
// other members skip it. Component 300 (ItemInstances) is dropped entirely - the
// intersection only needs item hashes, not per-instance light levels.
// 102 ProfileInventories · 200 Characters · 201 CharacterInventories ·
// 205 CharacterEquipment · 305 ItemSockets (caller only) · 800 Collectibles
const BASE_COMPONENTS = "102,200,201,205,800";
const CALLER_COMPONENTS = "102,200,201,205,305,800";
const VAULT_BUCKET = 138197802;
const NOT_ACQUIRED = 1;
const PERK_SOCKET_INDICES = [3, 4, 5];

interface RawWeapon {
  itemHash: number;
  itemInstanceId: string;
  slot: WeaponSlot;
  location: "character" | "vault";
  characterId?: string;
  isEquipped: boolean;
  lightLevel: number;
}

interface MemberData {
  weapons: RawWeapon[];
  vaultItems: Array<{ itemHash: number; itemInstanceId: string; lightLevel: number }>;
  collectibles: Set<number>;
  sockets: Map<string, number[]>;
  barrelHashes: Map<string, number>;
  magazineHashes: Map<string, number>;
  masterworkHashes: Map<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAnyArray(v: unknown): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.isArray(v) ? (v as any[]) : [];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, characterId } = schema.parse(await req.json());

    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, display_name, bungie_membership_type, bungie_membership_id")
      .eq("lobby_id", lobbyId);

    if (!members?.length) {
      return NextResponse.json({ error: "No members found" }, { status: 404 });
    }

    const slots: WeaponSlot[] = ["kinetic", "energy", "power"];

    // ── Phase 1: ONE Bungie API call per member (was 3) ──────────────────────

    const memberDataMap = new Map<string, MemberData>();

    await Promise.all(
      members.map(async (member) => {
        try {
          const token = await getBungieToken(member.user_id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const components =
            member.user_id === session.userId ? CALLER_COMPONENTS : BASE_COMPONENTS;
          const profile: any = await bungieGet<unknown>(
            `/Destiny2/${member.bungie_membership_type}/Profile/${member.bungie_membership_id}/?components=${components}`,
            token
          );

          const instances: Record<string, { primaryStat?: { value: number } }> =
            profile?.itemComponents?.instances?.data ?? {};

          const weapons: RawWeapon[] = [];
          const vaultItems: MemberData["vaultItems"] = [];

          const charEquipData: Record<string, { items: unknown[] }> =
            profile?.characterEquipment?.data ?? {};

          for (const [charId, charEquip] of Object.entries(charEquipData)) {
            const charItems = asAnyArray(charEquip.items);
            const equippedIds = new Set(charItems.map((i) => i.itemInstanceId as string));

            for (const item of charItems) {
              const slot = bucketToSlot(item.bucketHash as number);
              if (!slot) continue;
              weapons.push({
                itemHash: item.itemHash as number,
                itemInstanceId: item.itemInstanceId as string,
                slot,
                location: "character",
                characterId: charId,
                isEquipped: true,
                lightLevel: instances[item.itemInstanceId]?.primaryStat?.value ?? 0,
              });
            }

            const bagItems = asAnyArray(profile?.characterInventories?.data?.[charId]?.items);
            for (const item of bagItems) {
              const slot = bucketToSlot(item.bucketHash as number);
              if (!slot) continue;
              weapons.push({
                itemHash: item.itemHash as number,
                itemInstanceId: item.itemInstanceId as string,
                slot,
                location: "character",
                characterId: charId,
                isEquipped: equippedIds.has(item.itemInstanceId as string),
                lightLevel: instances[item.itemInstanceId]?.primaryStat?.value ?? 0,
              });
            }
          }

          const profileInventoryItems = asAnyArray(profile?.profileInventory?.data?.items);
          for (const item of profileInventoryItems) {
            if ((item.bucketHash as number) !== VAULT_BUCKET) continue;
            vaultItems.push({
              itemHash: item.itemHash as number,
              itemInstanceId: item.itemInstanceId as string,
              lightLevel: instances[item.itemInstanceId]?.primaryStat?.value ?? 0,
            });
          }

          const collectibles = new Set<number>();
          const collectiblesData: Record<string, { state: number }> =
            profile?.profileCollectibles?.data?.collectibles ?? {};
          for (const [hashStr, entry] of Object.entries(collectiblesData)) {
            if ((entry.state & NOT_ACQUIRED) === 0) collectibles.add(Number(hashStr));
          }

          const sockets = new Map<string, number[]>();
          const barrelHashes = new Map<string, number>();
          const magazineHashes = new Map<string, number>();
          const masterworkHashes = new Map<string, number>();
          const socketsData: Record<string, { sockets: Array<{ plugHash?: number; isVisible?: boolean }> }> =
            profile?.itemComponents?.sockets?.data ?? {};
          for (const [instanceId, sockData] of Object.entries(socketsData)) {
            const perks: number[] = [];
            for (const idx of PERK_SOCKET_INDICES) {
              const socket = sockData.sockets[idx];
              if (!socket?.plugHash) break;
              if (socket.isVisible === false) continue;
              perks.push(socket.plugHash);
            }
            if (perks.length > 0) sockets.set(instanceId, perks);

            const barrelHash = sockData.sockets[1]?.plugHash;
            const magazineHash = sockData.sockets[2]?.plugHash;
            const masterworkHash = sockData.sockets[6]?.plugHash;

            if (barrelHash) barrelHashes.set(instanceId, barrelHash);
            if (magazineHash) magazineHashes.set(instanceId, magazineHash);
            if (masterworkHash) masterworkHashes.set(instanceId, masterworkHash);
          }

          memberDataMap.set(member.user_id, { weapons, vaultItems, collectibles, sockets, barrelHashes, magazineHashes, masterworkHashes });
        } catch (e) {
          console.warn(
            `Skipping member ${member.user_id}:`,
            e instanceof Error ? e.message : e
          );
        }
      })
    );

    // Guard: every member's inventory MUST load. If even one fails, rolling
    // could pick a weapon the missing player doesn't own, and apply would
    // silently skip that slot for them. Block the roll and name who failed so
    // they can re-auth / retry, rather than producing a broken intersection.
    const failedMembers = members.filter((m) => !memberDataMap.has(m.user_id));
    if (failedMembers.length > 0) {
      const names = failedMembers.map((m) => m.display_name).join(", ");
      return NextResponse.json(
        {
          error: `Couldn't load inventory for: ${names}. They may need to sign out and back in. Try again once everyone is loaded.`,
        },
        { status: 409 }
      );
    }

    // ── Phase 2: Batch vault def lookup across all members (Supabase cache) ──

    const allVaultHashes = new Set<number>();
    for (const data of memberDataMap.values()) {
      for (const item of data.vaultItems) allVaultHashes.add(item.itemHash);
    }

    const vaultDefMap =
      allVaultHashes.size > 0
        ? await getWeaponDefinitions([...allVaultHashes])
        : new Map();

    for (const data of memberDataMap.values()) {
      for (const item of data.vaultItems) {
        const def = vaultDefMap.get(item.itemHash);
        if (!def) continue;
        const slot = bucketToSlot(def.defaultBucketHash);
        if (!slot) continue;
        data.weapons.push({
          itemHash: item.itemHash,
          itemInstanceId: item.itemInstanceId,
          slot,
          location: "vault",
          isEquipped: false,
          lightLevel: item.lightLevel,
        });
      }
    }

    // ── Phase 3: Per-member slot sets ────────────────────────────────────────

    const memberSlotSets = new Map<string, Record<WeaponSlot, Set<number>>>();
    const memberCollectibleMap = new Map<string, Set<number>>();

    for (const [userId, data] of memberDataMap) {
      const sets: Record<WeaponSlot, Set<number>> = {
        kinetic: new Set(),
        energy: new Set(),
        power: new Set(),
      };
      for (const w of data.weapons) sets[w.slot].add(w.itemHash);
      memberSlotSets.set(userId, sets);
      memberCollectibleMap.set(userId, data.collectibles);
    }

    // ── Phase 4: Inventory intersection ──────────────────────────────────────

    const intersection: Record<WeaponSlot, Set<number>> = {
      kinetic: new Set(),
      energy: new Set(),
      power: new Set(),
    };
    for (const slot of slots) {
      const memberSets = [...memberSlotSets.values()].map((s) => s[slot]);
      if (memberSets.length === 0) continue;
      const [first, ...rest] = memberSets;
      for (const hash of first) {
        if (rest.every((s) => s.has(hash))) intersection[slot].add(hash);
      }
    }

    // ── Phase 5: Exotic collection expansion ─────────────────────────────────

    const unionHashes = new Set<number>();
    for (const sets of memberSlotSets.values()) {
      for (const slot of slots) sets[slot].forEach((h) => unionHashes.add(h));
    }
    for (const slot of slots) intersection[slot].forEach((h) => unionHashes.delete(h));

    const candidateDefMap =
      unionHashes.size > 0 ? await getWeaponDefinitions([...unionHashes]) : new Map();

    const collectionHashSet = new Set<number>();

    for (const [hash, def] of candidateDefMap) {
      if (def.tierType !== 6) continue;
      if (!def.collectibleHash) continue;
      const slot = bucketToSlot(def.defaultBucketHash);
      if (!slot) continue;
      let allHaveIt = true;
      for (const [userId, sets] of memberSlotSets) {
        if (sets[slot].has(hash)) continue;
        const acquired = memberCollectibleMap.get(userId);
        if (!acquired?.has(def.collectibleHash)) {
          allHaveIt = false;
          break;
        }
      }
      if (allHaveIt) {
        intersection[slot].add(hash);
        collectionHashSet.add(hash);
      }
    }

    // ── Phase 6: Definitions for final intersection ───────────────────────────

    const allIntersectionHashes = [
      ...new Set([
        ...intersection.kinetic,
        ...intersection.energy,
        ...intersection.power,
      ]),
    ];

    const inventoryOnlyHashes = allIntersectionHashes.filter(
      (h) => !candidateDefMap.has(h)
    );
    const inventoryDefMap =
      inventoryOnlyHashes.length > 0
        ? await getWeaponDefinitions(inventoryOnlyHashes)
        : new Map();

    const defMap = new Map([...inventoryDefMap, ...candidateDefMap, ...vaultDefMap]);

    const weaponDetails: Record<
      string,
      {
        name: string;
        icon: string;
        watermark?: string;
        weaponType: string;
        damageType: string;
        tierType: number;
        tierName: string;
        ammoType: string;
        stats: Record<string, number>;
      }
    > = {};
    for (const [hash, def] of defMap.entries()) {
      if (!allIntersectionHashes.includes(hash)) continue;
      weaponDetails[hash.toString()] = {
        name: def.name,
        icon: def.icon,
        watermark: def.watermark,
        weaponType: def.weaponType,
        damageType: def.damageType,
        tierType: def.tierType,
        tierName: def.tierName,
        ammoType: def.ammoType,
        stats: def.stats,
      };
    }

    const intersectionArrays: Record<WeaponSlot, number[]> = {
      kinetic: [...intersection.kinetic],
      energy: [...intersection.energy],
      power: [...intersection.power],
    };

    // ── Phase 7: Equipped hashes for seeding initial roll ────────────────────

    const myWeapons = memberDataMap.get(session.userId)?.weapons ?? [];
    const equippedHashes: Record<WeaponSlot, number | null> = {
      kinetic: null,
      energy: null,
      power: null,
    };
    for (const slot of slots) {
      const equipped =
        myWeapons.find(
          (w) =>
            w.slot === slot &&
            w.isEquipped &&
            (!characterId || w.characterId === characterId)
        ) ?? myWeapons.find((w) => w.slot === slot && w.isEquipped);
      if (equipped) equippedHashes[slot] = equipped.itemHash;
    }

    // The round starts on the captain's currently-equipped loadout. Make sure
    // those weapons have details to render even if they aren't in the shared
    // pool (otherwise the seeded slot would come back empty).
    const equippedHashList = Object.values(equippedHashes).filter(
      (h): h is number => h !== null
    );
    const missingEquipped = equippedHashList.filter(
      (h) => !weaponDetails[h.toString()]
    );
    if (missingEquipped.length > 0) {
      const eqDefs = await getWeaponDefinitions(missingEquipped);
      for (const [hash, def] of eqDefs) {
        weaponDetails[hash.toString()] = {
          name: def.name,
          icon: def.icon,
          watermark: def.watermark,
          weaponType: def.weaponType,
          damageType: def.damageType,
          tierType: def.tierType,
          tierName: def.tierName,
          ammoType: def.ammoType,
          stats: def.stats,
        };
      }
    }

    // ── Phase 8: Perk rolls from pre-fetched sockets (no extra API call) ─────

    const allIntersectionHashSet = new Set(allIntersectionHashes);
    // Include ALL weapons the player owns, not just intersection.
    // This ensures we capture perk data for re-released weapons.
    const myAllWeapons = myWeapons;

    const instancePerks: Record<
      string,
      Array<{
        instanceId: string;
        perks: string[];
        location: string;
        characterId?: string;
        barrelName?: string;
        barrelIcon?: string;
        magazineName?: string;
        magazineIcon?: string;
        masterworkName?: string;
        masterworkIcon?: string;
      }>
    > = {};

    const myData = memberDataMap.get(session.userId);
    if (myData && myAllWeapons.length > 0) {
      const myInstanceIds = new Set(myAllWeapons.map((w) => w.itemInstanceId));
      const allPerkHashes = new Set<number>();

      for (const instanceId of myInstanceIds) {
        for (const h of myData.sockets.get(instanceId) ?? []) allPerkHashes.add(h);
      }

      for (const instanceId of myInstanceIds) {
        const barrelHash = myData.barrelHashes.get(instanceId);
        const magazineHash = myData.magazineHashes.get(instanceId);
        const masterworkHash = myData.masterworkHashes.get(instanceId);

        if (barrelHash) allPerkHashes.add(barrelHash);
        if (magazineHash) allPerkHashes.add(magazineHash);
        if (masterworkHash) allPerkHashes.add(masterworkHash);
      }

      const [perkNameMap, perkIconMap] = await Promise.all([
        getPerkNames([...allPerkHashes]),
        getPerkIcons([...allPerkHashes]),
      ]);

      for (const weapon of myAllWeapons) {
        const hashes = myData.sockets.get(weapon.itemInstanceId);
        if (!hashes) continue;
        const perks = hashes
          .map((h) => perkNameMap.get(h))
          .filter((n): n is string => n !== undefined);
        if (perks.length === 0) continue;
        const key = weapon.itemHash.toString();
        if (!instancePerks[key]) instancePerks[key] = [];

        const barrelHash = myData.barrelHashes.get(weapon.itemInstanceId);
        const magazineHash = myData.magazineHashes.get(weapon.itemInstanceId);
        const masterworkHash = myData.masterworkHashes.get(weapon.itemInstanceId);

        instancePerks[key].push({
          instanceId: weapon.itemInstanceId,
          perks,
          location: weapon.location,
          characterId: weapon.characterId,
          barrelName: barrelHash ? perkNameMap.get(barrelHash) : undefined,
          barrelIcon: barrelHash ? perkIconMap.get(barrelHash) : undefined,
          magazineName: magazineHash ? perkNameMap.get(magazineHash) : undefined,
          magazineIcon: magazineHash ? perkIconMap.get(magazineHash) : undefined,
          masterworkName: masterworkHash ? perkNameMap.get(masterworkHash) : undefined,
          masterworkIcon: masterworkHash ? perkIconMap.get(masterworkHash) : undefined,
        });
      }
    }

    void flushDefinitionCache();

    return NextResponse.json({
      intersection: intersectionArrays,
      weaponDetails,
      memberCount: memberDataMap.size,
      equippedHashes,
      instancePerks,
      collectionHashes: [...collectionHashSet],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
