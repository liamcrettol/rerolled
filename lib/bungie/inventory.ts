import { bungieGet } from "./client";
import type { BungieProfileResponse, DestinyCharacter } from "@/types/bungie";
import { ALL_WEAPON_BUCKETS, bucketToSlot } from "@/types/bungie";
import { lookupWeapon } from "@/lib/manifest/lookup";
import type { ResolvedWeapon } from "@/types/weapon";

const PROFILE_COMPONENTS = [
  200, // Characters
  201, // CharacterInventories
  205, // CharacterEquipment
  102, // ProfileInventory (vault)
  300, // ItemInstances
  302, // ItemPerks (deprecated but still useful)
  304, // ItemStats
  305, // ItemSockets
  306, // ItemTalentGrids
  307, // ItemCommonData
  308, // ItemPlugStates
  309, // ItemPlugObjectives
  310, // ItemReusablePlugs
].join(",");

export async function getProfile(
  membershipType: number,
  membershipId: string,
  accessToken: string
): Promise<BungieProfileResponse> {
  return bungieGet<BungieProfileResponse>(
    `/Destiny2/${membershipType}/Profile/${membershipId}/?components=${PROFILE_COMPONENTS}`,
    accessToken
  );
}

export async function getCharacters(
  membershipType: number,
  membershipId: string,
  accessToken: string
): Promise<DestinyCharacter[]> {
  const profile = await getProfile(membershipType, membershipId, accessToken);
  return Object.values(profile.characters.data);
}

export async function getWeapons(
  membershipType: number,
  membershipId: string,
  accessToken: string
): Promise<ResolvedWeapon[]> {
  const profile = await getProfile(membershipType, membershipId, accessToken);
  const weapons: ResolvedWeapon[] = [];

  const instances = profile.itemComponents?.instances?.data ?? {};
  const sockets = profile.itemComponents?.sockets?.data ?? {};
  const reusablePlugs = profile.itemComponents?.reusablePlugs?.data ?? {};

  function processItems(
    items: BungieProfileResponse["characterInventories"]["data"][string]["items"],
    location: "character" | "vault" | "postmaster",
    characterId?: string,
    equippedSet?: Set<string>
  ) {
    for (const item of items) {
      if (!ALL_WEAPON_BUCKETS.has(item.bucketHash as 1498876634 | 2465295065 | 953998645)) continue;

      const slot = bucketToSlot(item.bucketHash);
      if (!slot) continue;

      const instance = instances[item.itemInstanceId];
      if (!instance) continue;

      const resolved = lookupWeapon({
        item,
        instance,
        sockets: sockets[item.itemInstanceId]?.sockets ?? [],
        reusablePlugs: reusablePlugs[item.itemInstanceId]?.plugs ?? {},
        slot,
        location,
        characterId,
        isEquipped: equippedSet?.has(item.itemInstanceId) ?? false,
      });

      if (resolved) weapons.push(resolved);
    }
  }

  // Equipped items per character
  for (const [charId, charEquip] of Object.entries(
    profile.characterEquipment?.data ?? {}
  )) {
    const equippedIds = new Set(charEquip.items.map((i) => i.itemInstanceId));
    processItems(charEquip.items, "character", charId, equippedIds);
  }

  // Unequipped items per character
  for (const [charId, charInv] of Object.entries(
    profile.characterInventories?.data ?? {}
  )) {
    const equippedIds = new Set(
      (profile.characterEquipment?.data[charId]?.items ?? []).map(
        (i) => i.itemInstanceId
      )
    );
    processItems(charInv.items, "character", charId, equippedIds);
  }

  // Vault
  const vaultItems = profile.profileInventory?.data?.items ?? [];
  processItems(vaultItems, "vault");

  return weapons;
}
