// Look up individual item definitions from the Bungie API.
// Much faster than downloading the full manifest in a serverless environment.

const BUNGIE_ROOT = "https://www.bungie.net/Platform";
const BUNGIE_CDN = "https://www.bungie.net";

export interface WeaponDefinition {
  itemHash: number;
  name: string;
  icon: string;
  weaponType: string;
  ammoType: string;
  damageType: string;
  tierName: string;
  tierType: number;
  flavorText: string;
  /** inventory.bucketTypeHash — the slot this weapon belongs to (kinetic/energy/power) */
  defaultBucketHash: number;
}

const AMMO_TYPE_NAMES: Record<number, string> = { 1: "Primary", 2: "Special", 3: "Heavy" };
const TIER_NAMES: Record<number, string> = { 6: "Exotic", 5: "Legendary", 4: "Rare" };
const DAMAGE_TYPE_NAMES: Record<number, string> = {
  3373582085: "Kinetic",
  1847026933: "Solar",
  2303181850: "Arc",
  3454344768: "Void",
  151347233: "Stasis",
  3949783978: "Strand",
};

// In-memory cache per serverless invocation
const defCache = new Map<number, WeaponDefinition>();

export async function getWeaponDefinition(
  itemHash: number
): Promise<WeaponDefinition | null> {
  if (defCache.has(itemHash)) return defCache.get(itemHash)!;

  try {
    const res = await fetch(
      `${BUNGIE_ROOT}/Destiny2/Manifest/DestinyInventoryItemDefinition/${itemHash}/`,
      {
        headers: { "X-API-Key": process.env.BUNGIE_API_KEY! },
        next: { revalidate: 86400 }, // cache 24h at edge
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const def = data.Response;
    if (!def || def.itemType !== 3) return null; // not a weapon

    const result: WeaponDefinition = {
      itemHash,
      name: def.displayProperties?.name ?? "Unknown",
      icon: def.displayProperties?.icon ? `${BUNGIE_CDN}${def.displayProperties.icon}` : "",
      weaponType: def.itemTypeDisplayName ?? "Weapon",
      ammoType: AMMO_TYPE_NAMES[def.equippingBlock?.ammoType ?? 1] ?? "Primary",
      damageType: DAMAGE_TYPE_NAMES[def.defaultDamageTypeHash ?? 0] ?? "Kinetic",
      tierName: TIER_NAMES[def.inventory?.tierType ?? 5] ?? "Legendary",
      tierType: def.inventory?.tierType ?? 5,
      flavorText: def.flavorText ?? "",
      defaultBucketHash: def.inventory?.bucketTypeHash ?? 0,
    };
    defCache.set(itemHash, result);
    return result;
  } catch {
    return null;
  }
}

export async function getWeaponDefinitions(
  hashes: number[]
): Promise<Map<number, WeaponDefinition>> {
  const results = new Map<number, WeaponDefinition>();
  await Promise.all(
    hashes.map(async (hash) => {
      const def = await getWeaponDefinition(hash);
      if (def) results.set(hash, def);
    })
  );
  return results;
}
