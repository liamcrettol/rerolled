import { bungieGet } from "./client";
import { getWeaponDefinitions } from "./definitions";
import type { BungieProfileResponse } from "@/types/bungie";
import { bucketToSlot } from "@/types/bungie";
import type { WeaponSlot } from "@/types/bungie";

// Items stored in the vault share this single bucket hash instead of their slot bucket.
// We use the item definition's ammo type to recover the slot.
const VAULT_BUCKET = 138197802;

const AMMO_TO_SLOT: Record<string, WeaponSlot> = {
  Primary: "kinetic",
  Special: "energy",
  Heavy: "power",
};

export interface RawWeapon {
  itemHash: number;
  itemInstanceId: string;
  slot: WeaponSlot;
  location: "character" | "vault";
  characterId?: string;
  isEquipped: boolean;
  lightLevel: number;
}

const PROFILE_COMPONENTS = [200, 201, 205, 102, 300].join(",");

export async function getRawWeapons(
  membershipType: number,
  membershipId: string,
  accessToken: string
): Promise<RawWeapon[]> {
  const profile = await bungieGet<BungieProfileResponse>(
    `/Destiny2/${membershipType}/Profile/${membershipId}/?components=${PROFILE_COMPONENTS}`,
    accessToken
  );

  const weapons: RawWeapon[] = [];
  const instances = profile.itemComponents?.instances?.data ?? {};

  function addWeapon(
    item: { itemHash: number; itemInstanceId: string },
    slot: WeaponSlot,
    location: "character" | "vault",
    characterId?: string,
    isEquipped = false
  ) {
    const lightLevel = instances[item.itemInstanceId]?.primaryStat?.value ?? 0;
    weapons.push({ itemHash: item.itemHash, itemInstanceId: item.itemInstanceId, slot, location, characterId, isEquipped, lightLevel });
  }

  // Character-equipped and character-bag items always have the correct slot bucket hash.
  for (const [charId, charEquip] of Object.entries(profile.characterEquipment?.data ?? {})) {
    const equippedIds = new Set(charEquip.items.map((i) => i.itemInstanceId));
    for (const item of charEquip.items) {
      const slot = bucketToSlot(item.bucketHash);
      if (slot) addWeapon(item, slot, "character", charId, true);
    }
    for (const item of profile.characterInventories?.data[charId]?.items ?? []) {
      const slot = bucketToSlot(item.bucketHash);
      if (slot) addWeapon(item, slot, "character", charId, equippedIds.has(item.itemInstanceId));
    }
  }

  // Vault items use the vault bucket hash (138197802) instead of the slot bucket.
  // Determine slot from the weapon definition's ammo type.
  const vaultItems = profile.profileInventory?.data?.items ?? [];
  const vaultWeaponItems = vaultItems.filter((i) => i.bucketHash === VAULT_BUCKET);

  if (vaultWeaponItems.length > 0) {
    const uniqueHashes = [...new Set(vaultWeaponItems.map((i) => i.itemHash))];
    const defs = await getWeaponDefinitions(uniqueHashes); // returns only itemType === 3 (weapons)

    for (const item of vaultWeaponItems) {
      const def = defs.get(item.itemHash);
      if (!def) continue; // not a weapon — armor, material, etc.
      const slot = AMMO_TO_SLOT[def.ammoType];
      if (!slot) continue;
      addWeapon(item, slot, "vault");
    }
  }

  return weapons;
}
