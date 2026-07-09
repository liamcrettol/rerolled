import { bungieGet } from "./client";
import type { BungieProfileResponse, DestinyCharacter } from "@/types/bungie";
import { ALL_WEAPON_BUCKETS, bucketToSlot } from "@/types/bungie";
import type { WeaponSlot } from "@/types/bungie";
import { getWeaponDefinitions } from "@/lib/bungie/definitions";
import type { ResolvedWeapon } from "@/types/weapon";

// Vault items share this single bucket hash instead of their slot bucket — the
// real slot only comes from the weapon definition's defaultBucketHash, resolved
// once defs are fetched below. Same pattern as lib/bungie/rawInventory.ts.
const VAULT_BUCKET = 138197802;

const DAMAGE_TYPE_ICONS: Record<string, string> = {
  Kinetic: "/icons/damage-kinetic.png",
  Solar: "/icons/damage-solar.png",
  Arc: "/icons/damage-arc.png",
  Void: "/icons/damage-void.png",
  Stasis: "/icons/damage-stasis.png",
  Strand: "/icons/damage-strand.png",
};

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

async function getProfile(
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

// Characters-only fetch (no inventory components) for chrome that just needs
// an emblem, e.g. the nav player card — avoids the full PROFILE_COMPONENTS
// pull on every page load.
export async function getPrimaryCharacterEmblem(
  membershipType: number,
  membershipId: string,
  accessToken: string
): Promise<{ emblemPath: string; emblemBackgroundPath: string } | null> {
  const profile = await bungieGet<{ characters: BungieProfileResponse["characters"] }>(
    `/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`,
    accessToken
  );
  const characters = Object.values(profile.characters.data);
  if (!characters.length) return null;

  const latest = characters.reduce((a, b) => (a.dateLastPlayed > b.dateLastPlayed ? a : b));
  return { emblemPath: latest.emblemPath, emblemBackgroundPath: latest.emblemBackgroundPath };
}

interface RawItem {
  itemHash: number;
  itemInstanceId: string;
  slot: WeaponSlot;
  location: "character" | "vault" | "postmaster";
  characterId?: string;
  isEquipped: boolean;
}

export async function getWeapons(
  membershipType: number,
  membershipId: string,
  accessToken: string
): Promise<ResolvedWeapon[]> {
  const profile = await getProfile(membershipType, membershipId, accessToken);
  const instances = profile.itemComponents?.instances?.data ?? {};
  const raw: RawItem[] = [];

  // Character-equipped and character-bag items always carry the correct slot
  // bucket hash directly.
  function collectCharacterItems(
    items: BungieProfileResponse["characterInventories"]["data"][string]["items"],
    characterId: string,
    equippedSet: Set<string>
  ) {
    for (const item of items) {
      if (!ALL_WEAPON_BUCKETS.has(item.bucketHash as 1498876634 | 2465295065 | 953998645)) continue;

      const slot = bucketToSlot(item.bucketHash);
      if (!slot) continue;
      if (!instances[item.itemInstanceId]) continue;

      raw.push({
        itemHash: item.itemHash,
        itemInstanceId: item.itemInstanceId,
        slot,
        location: "character",
        characterId,
        isEquipped: equippedSet.has(item.itemInstanceId),
      });
    }
  }

  // Equipped items per character
  for (const [charId, charEquip] of Object.entries(
    profile.characterEquipment?.data ?? {}
  )) {
    const equippedIds = new Set(charEquip.items.map((i) => i.itemInstanceId));
    collectCharacterItems(charEquip.items, charId, equippedIds);
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
    collectCharacterItems(charInv.items, charId, equippedIds);
  }

  // Vault items all carry VAULT_BUCKET instead of a slot bucket, so they can't
  // be classified (or even confirmed to be weapons) until defs are resolved
  // below — collect the candidates now, slot them after.
  const vaultCandidates = (profile.profileInventory?.data?.items ?? []).filter(
    (item) => item.bucketHash === VAULT_BUCKET && instances[item.itemInstanceId]
  );

  // Resolved from the prebuilt static weapons table (lib/bungie/definitions.ts),
  // not the live ~190MB Bungie manifest — that path OOM'd the roll route (#274).
  const defs = await getWeaponDefinitions([
    ...new Set([...raw.map((r) => r.itemHash), ...vaultCandidates.map((i) => i.itemHash)]),
  ]);

  for (const item of vaultCandidates) {
    const def = defs.get(item.itemHash);
    if (!def) continue; // not a weapon - armor, material, etc.
    const slot = bucketToSlot(def.defaultBucketHash);
    if (!slot) continue;
    raw.push({
      itemHash: item.itemHash,
      itemInstanceId: item.itemInstanceId,
      slot,
      location: "vault",
      isEquipped: false,
    });
  }

  const weapons: ResolvedWeapon[] = [];
  for (const item of raw) {
    const def = defs.get(item.itemHash);
    if (!def) continue;
    const instance = instances[item.itemInstanceId];
    weapons.push({
      itemHash: item.itemHash,
      itemInstanceId: item.itemInstanceId,
      name: def.name,
      flavorText: def.flavorText,
      icon: def.icon,
      slot: item.slot,
      weaponType: def.weaponType,
      ammoType: def.ammoType,
      damageType: def.damageType,
      damageTypeIcon: DAMAGE_TYPE_ICONS[def.damageType] ?? DAMAGE_TYPE_ICONS.Kinetic,
      lightLevel: instance?.primaryStat?.value ?? 0,
      isEquipped: item.isEquipped,
      location: item.location,
      characterId: item.characterId,
      // Perks/stats aren't needed by any current caller (roll route only reads
      // the fields above) — left empty rather than resolving sockets here.
      perks: [],
      stats: [],
      tierType: def.tierType,
      tierName: def.tierName,
    });
  }

  return weapons;
}
