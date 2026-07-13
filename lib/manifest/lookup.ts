import { getManifest } from "./download";
import type {
  DestinyItemComponent,
  DestinyItemInstance,
  DestinySocket,
} from "@/types/bungie";
import type { ResolvedWeapon, ResolvedPerk, ResolvedStat } from "@/types/weapon";
import type { WeaponSlot } from "@/types/bungie";
import { bungieImg } from "@/lib/destiny/constants";


// Damage type hash → display name
const DAMAGE_TYPE_NAMES: Record<number, string> = {
  3373582085: "Kinetic",
  1847026933: "Solar",
  2303181850: "Arc",
  3454344768: "Void",
  151347233: "Stasis",
  3949783978: "Strand",
};

// Ammo type enum
const AMMO_TYPE_NAMES: Record<number, string> = {
  1: "Primary",
  2: "Special",
  3: "Heavy",
};

// Tier type enum
const TIER_NAMES: Record<number, string> = {
  6: "Exotic",
  5: "Legendary",
  4: "Rare",
  3: "Uncommon",
  2: "Common",
};

interface LookupOptions {
  item: DestinyItemComponent;
  instance: DestinyItemInstance;
  sockets: DestinySocket[];
  reusablePlugs: Record<string, Array<{ plugItemHash: number; canInsert: boolean; enabled: boolean }>>;
  slot: WeaponSlot;
  location: "character" | "vault" | "postmaster";
  characterId?: string;
  isEquipped: boolean;
}

let manifest: Awaited<ReturnType<typeof getManifest>> | null = null;

async function ensureManifest() {
  if (!manifest) manifest = await getManifest();
  return manifest;
}

// Synchronous lookup used after manifest is pre-loaded
export function lookupWeapon(opts: LookupOptions): ResolvedWeapon | null {
  if (!manifest) return null;
  return resolveWeapon(opts, manifest);
}

function resolveWeapon(
  opts: LookupOptions,
  m: Awaited<ReturnType<typeof getManifest>>
): ResolvedWeapon | null {
  const { item, instance, sockets, reusablePlugs, slot, location, characterId, isEquipped } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (m.items as any)[item.itemHash.toString()];
  if (!def) return null;

  // Only weapons (itemType === 3)
  if (def.itemType !== 3) return null;

  const tierType: number = def.inventory?.tierType ?? 5;
  const ammoType: number = def.equippingBlock?.ammoType ?? 1;
  const damageTypeHash: number =
    instance.damageTypeHash ?? def.defaultDamageTypeHash ?? 0;

  // Build perk columns from sockets
  const perkColumns: ResolvedPerk[][] = [];
  for (let i = 0; i < sockets.length; i++) {
    const socket = sockets[i];
    const socketDef = def.sockets?.socketEntries?.[i];
    if (!socketDef) continue;

    // Only grab perk sockets (not intrinsic/cosmetic/shader/etc.)
    const socketCategory = socketDef.socketTypeHash;
    const plugOptions: ResolvedPerk[] = [];

    const reusable = reusablePlugs[i.toString()] ?? [];
    const plugHashes = reusable.length > 0
      ? reusable.map((p) => p.plugItemHash)
      : socket.plugHash
      ? [socket.plugHash]
      : [];

    for (const plugHash of plugHashes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plugDef = (m.items as any)[plugHash.toString()];
      if (!plugDef) continue;
      if (!plugDef.displayProperties?.name) continue;

      plugOptions.push({
        hash: plugHash,
        name: plugDef.displayProperties.name,
        description: plugDef.displayProperties.description ?? "",
        icon: plugDef.displayProperties.icon
          ? bungieImg(plugDef.displayProperties.icon)
          : "",
        isSelected: socket.plugHash === plugHash,
      });
    }

    if (plugOptions.length > 0) {
      perkColumns.push(plugOptions);
    }
    void socketCategory; // suppress unused warning
  }

  // Stats
  const stats: ResolvedStat[] = [];
  if (def.stats?.stats) {
    for (const [statHash, statData] of Object.entries(def.stats.stats)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statDef = (m.stats as any)[statHash];
      if (!statDef?.displayProperties?.name) continue;
      stats.push({
        hash: Number(statHash),
        name: statDef.displayProperties.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: (statData as any).value ?? 0,
        displayMaximum: statDef.displayMaximum ?? 100,
      });
    }
  }

  return {
    itemHash: item.itemHash,
    itemInstanceId: item.itemInstanceId,
    name: def.displayProperties?.name ?? "Unknown Weapon",
    flavorText: def.flavorText ?? "",
    icon: def.displayProperties?.icon
      ? bungieImg(def.displayProperties.icon)
      : "",
    screenshot: def.screenshot ? bungieImg(def.screenshot) : undefined,
    slot,
    weaponType: def.itemTypeDisplayName ?? "Weapon",
    ammoType: AMMO_TYPE_NAMES[ammoType] ?? "Primary",
    damageType: DAMAGE_TYPE_NAMES[damageTypeHash] ?? "Kinetic",
    damageTypeIcon: getDamageTypeIcon(damageTypeHash),
    lightLevel: instance.primaryStat?.value ?? 0,
    isEquipped,
    location,
    characterId,
    perks: perkColumns,
    stats,
    tierType,
    tierName: TIER_NAMES[tierType] ?? "Legendary",
  };
}

function getDamageTypeIcon(hash: number): string {
  const icons: Record<number, string> = {
    3373582085: "/icons/damage-kinetic.png",
    1847026933: "/icons/damage-solar.png",
    2303181850: "/icons/damage-arc.png",
    3454344768: "/icons/damage-void.png",
    151347233: "/icons/damage-stasis.png",
    3949783978: "/icons/damage-strand.png",
  };
  return icons[hash] ?? "/icons/damage-kinetic.png";
}

export { ensureManifest };
