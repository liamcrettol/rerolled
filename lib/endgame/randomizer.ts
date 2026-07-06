import { getActivityPool, type ActivityKind, type ScoreAttackActivity } from "@/lib/scoreAttack/activityPool";
import { rollLoadout } from "@/lib/roulette/intersection";
import type { BungieProfileResponse, DestinyCharacter, WeaponSlot } from "@/types/bungie";
import type { ResolvedWeapon } from "@/types/weapon";

export type EndgameActivityKind = "grandmaster" | "dungeon" | "raid";

export interface EndgameActivitySelection {
  activityHash: number;
  name: string;
  kind: EndgameActivityKind;
  label: string;
}

export interface EndgameLoadoutItem {
  slot: WeaponSlot;
  itemHash: number;
  name: string;
  icon: string;
  weaponType: string;
  damageType: string;
}

export interface ExoticArmorChoice {
  itemHash: number;
  itemInstanceId: string;
  name: string;
  icon: string;
  slotLabel: string;
  classType: number;
  location: "character" | "vault";
  characterId?: string;
  isEquipped: boolean;
}

interface ManifestItemLike {
  itemType?: number;
  classType?: number;
  itemTypeDisplayName?: string;
  inventory?: {
    tierType?: number;
  };
  displayProperties?: {
    name?: string;
    icon?: string;
  };
}

const BUNGIE_CDN = "https://www.bungie.net";
const SLOTS: WeaponSlot[] = ["kinetic", "energy", "power"];

export const ENDGAME_ACTIVITY_KIND_LABELS: Record<EndgameActivityKind, string> = {
  grandmaster: "Grandmaster",
  dungeon: "Dungeon",
  raid: "Raid",
};

export const CLASS_NAMES: Record<number, string> = {
  0: "Titan",
  1: "Hunter",
  2: "Warlock",
};

const ENDGAME_TO_ACTIVITY_KIND: Record<EndgameActivityKind, ActivityKind> = {
  grandmaster: "grandmaster",
  dungeon: "dungeon",
  raid: "raid",
};

const ACTIVITY_TO_ENDGAME_KIND: Record<ActivityKind, EndgameActivityKind | null> = {
  grandmaster: "grandmaster",
  dungeon: "dungeon",
  raid: "raid",
  crucible: null,
  trials: null,
  "iron-banner": null,
  onslaught: null,
  "vanguard-op": null,
};

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

export function buildEndgameActivityPool(
  kinds: EndgameActivityKind[],
  source?: ScoreAttackActivity[]
): EndgameActivitySelection[] {
  const selectedKinds = [...new Set(kinds)];
  const activities =
    source ??
    getActivityPool({
      pillar: "pve",
      kinds: selectedKinds.map((kind) => ENDGAME_TO_ACTIVITY_KIND[kind]),
    });

  return activities.flatMap((activity) => {
    const kind = ACTIVITY_TO_ENDGAME_KIND[activity.kind];
    if (!kind || !selectedKinds.includes(kind)) return [];
    return activity.activityHashes.map((activityHash) => ({
      activityHash,
      name: activity.name,
      kind,
      label: ENDGAME_ACTIVITY_KIND_LABELS[kind],
    }));
  });
}

export function pickEndgameActivity(
  kinds: EndgameActivityKind[],
  rng: () => number = Math.random,
  source?: ScoreAttackActivity[]
): EndgameActivitySelection {
  const pool = buildEndgameActivityPool(kinds, source);
  if (pool.length === 0) {
    throw new Error("No raid, dungeon, or Grandmaster activities are available to roll.");
  }
  return pick(pool, rng);
}

export function buildEndgameWeaponRoll(
  weapons: ResolvedWeapon[],
  rng: () => number = Math.random
): EndgameLoadoutItem[] {
  const pools: Record<WeaponSlot, number[]> = { kinetic: [], energy: [], power: [] };
  const details: Record<
    string,
    { name: string; icon: string; weaponType: string; damageType: string; ammoType?: string; tierType?: number }
  > = {};

  for (const weapon of weapons) {
    const key = weapon.itemHash.toString();
    if (details[key]) continue;
    pools[weapon.slot].push(weapon.itemHash);
    details[key] = {
      name: weapon.name,
      icon: weapon.icon,
      weaponType: weapon.weaponType,
      damageType: weapon.damageType,
      ammoType: weapon.ammoType,
      tierType: weapon.tierType,
    };
  }

  const missingSlots = SLOTS.filter((slot) => pools[slot].length === 0);
  if (missingSlots.length > 0) {
    throw new Error(`You need at least one ${missingSlots.join(", ")} weapon to roll Endgame Roulette.`);
  }

  const rolled = rollLoadout(pools, details, undefined, undefined, "normal", rng);

  return SLOTS.map((slot) => {
    const itemHash = rolled[slot];
    if (!itemHash) {
      throw new Error("Couldn't build a full three-weapon loadout from your inventory.");
    }
    const detail = details[itemHash.toString()];
    return {
      slot,
      itemHash,
      name: detail.name,
      icon: detail.icon,
      weaponType: detail.weaponType,
      damageType: detail.damageType,
    };
  });
}

function iconUrl(path: string | undefined): string {
  if (!path) return "";
  return path.startsWith("http") ? path : `${BUNGIE_CDN}${path}`;
}

function itemTypeDisplaySortValue(slotLabel: string): number {
  const label = slotLabel.toLowerCase();
  if (label.includes("helmet")) return 0;
  if (label.includes("gauntlet") || label.includes("gloves")) return 1;
  if (label.includes("chest")) return 2;
  if (label.includes("leg")) return 3;
  if (label.includes("class")) return 4;
  return 5;
}

function armorChoiceRank(choice: ExoticArmorChoice, selectedCharacterId: string): number {
  if (choice.characterId === selectedCharacterId && choice.isEquipped) return 5;
  if (choice.characterId === selectedCharacterId) return 4;
  if (choice.location === "vault") return 3;
  if (choice.isEquipped) return 2;
  return 1;
}

function uniqueCharacterItemRows(
  rows: Array<{ itemHash: number; itemInstanceId: string }>,
  manifestItems: Record<string, ManifestItemLike>,
  classType: number,
  location: "character" | "vault",
  characterId?: string,
  isEquipped = false
): ExoticArmorChoice[] {
  const result: ExoticArmorChoice[] = [];
  for (const item of rows) {
    const def = manifestItems[item.itemHash.toString()];
    if (!def) continue;
    if (def.itemType !== 2) continue;
    if ((def.inventory?.tierType ?? 0) !== 6) continue;
    if (def.classType !== classType) continue;
    const name = def.displayProperties?.name?.trim();
    if (!name) continue;
    result.push({
      itemHash: item.itemHash,
      itemInstanceId: item.itemInstanceId,
      name,
      icon: iconUrl(def.displayProperties?.icon),
      slotLabel: def.itemTypeDisplayName ?? "Armor",
      classType,
      location,
      characterId,
      isEquipped,
    });
  }
  return result;
}

export function selectExoticArmorOptions(
  profile: Pick<BungieProfileResponse, "characters" | "characterEquipment" | "characterInventories" | "profileInventory">,
  manifestItems: Record<string, ManifestItemLike>,
  characterId: string
): { character: DestinyCharacter; options: ExoticArmorChoice[] } {
  const character = profile.characters.data[characterId];
  if (!character) {
    throw new Error("Character not found on your Bungie profile.");
  }

  const bestByHash = new Map<number, ExoticArmorChoice>();
  const classType = character.classType;

  const absorb = (choices: ExoticArmorChoice[]) => {
    for (const choice of choices) {
      const current = bestByHash.get(choice.itemHash);
      if (!current || armorChoiceRank(choice, characterId) > armorChoiceRank(current, characterId)) {
        bestByHash.set(choice.itemHash, choice);
      }
    }
  };

  absorb(
    uniqueCharacterItemRows(
      profile.characterEquipment?.data?.[characterId]?.items ?? [],
      manifestItems,
      classType,
      "character",
      characterId,
      true
    )
  );
  absorb(
    uniqueCharacterItemRows(
      profile.characterInventories?.data?.[characterId]?.items ?? [],
      manifestItems,
      classType,
      "character",
      characterId,
      false
    )
  );

  for (const [otherCharacterId, equipment] of Object.entries(profile.characterEquipment?.data ?? {})) {
    if (otherCharacterId === characterId) continue;
    absorb(uniqueCharacterItemRows(equipment.items ?? [], manifestItems, classType, "character", otherCharacterId, true));
  }

  for (const [otherCharacterId, inventory] of Object.entries(profile.characterInventories?.data ?? {})) {
    if (otherCharacterId === characterId) continue;
    absorb(uniqueCharacterItemRows(inventory.items ?? [], manifestItems, classType, "character", otherCharacterId, false));
  }

  absorb(
    uniqueCharacterItemRows(
      profile.profileInventory?.data?.items ?? [],
      manifestItems,
      classType,
      "vault"
    )
  );

  const options = [...bestByHash.values()].sort((a, b) => {
    const slotDiff = itemTypeDisplaySortValue(a.slotLabel) - itemTypeDisplaySortValue(b.slotLabel);
    if (slotDiff !== 0) return slotDiff;
    return a.name.localeCompare(b.name);
  });

  return { character, options };
}
