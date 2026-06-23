import { adminSupabase } from "@/lib/supabase/admin";

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
  defaultBucketHash: number;
  collectibleHash?: number;
  stats: Record<string, number>;
  intrinsicPerk: string | null;
}

const AMMO_TYPE_NAMES: Record<number, string> = { 1: "Primary", 2: "Special", 3: "Heavy" };
const WEAPON_STAT_HASHES: Record<number, string> = {
  4284893193: "RPM",
  4043523819: "Impact",
  1240592695: "Range",
  155624089: "Stability",
  943549884: "Handling",
  4188031367: "Reload",
  1345609583: "Aim Assist",
  3871231066: "Magazine",
  2961396640: "Charge Time",
  1931675084: "Inventory",
  3555269338: "Zoom",
};
const TIER_NAMES: Record<number, string> = { 6: "Exotic", 5: "Legendary", 4: "Rare" };
const DAMAGE_TYPE_NAMES: Record<number, string> = {
  3373582085: "Kinetic",
  1847026933: "Solar",
  2303181850: "Arc",
  3454344768: "Void",
  151347233: "Stasis",
  3949783978: "Strand",
};

// Per-invocation memory cache — survives across requests in the same warm instance.
const defMemCache = new Map<number, WeaponDefinition>();
const perkMemCache = new Map<number, string | null>();

// Supabase cache Promise is reused within the same serverless instance.
let supabaseDefCachePromise: Promise<Record<string, WeaponDefinition>> | null = null;
let supabasePerkCachePromise: Promise<Record<string, string>> | null = null;

// New defs/perks fetched from Bungie this request — flushed to Supabase at end.
const pendingDefs = new Map<number, WeaponDefinition>();
const pendingPerks = new Map<number, string>();

function emptyDefRecord(): Record<string, WeaponDefinition> {
  return {};
}
function emptyStringRecord(): Record<string, string> {
  return {};
}

function loadSupabaseDefCache(): Promise<Record<string, WeaponDefinition>> {
  if (!supabaseDefCachePromise) {
    supabaseDefCachePromise = adminSupabase
      .from("cached_manifest_metadata")
      .select("items_json")
      .eq("version", "weapon_defs")
      .single()
      .then(
        ({ data }) => (data?.items_json ?? {}) as Record<string, WeaponDefinition>
      )
      .catch(emptyDefRecord);
  }
  return supabaseDefCachePromise;
}

function loadSupabasePerkCache(): Promise<Record<string, string>> {
  if (!supabasePerkCachePromise) {
    supabasePerkCachePromise = adminSupabase
      .from("cached_manifest_metadata")
      .select("sandbox_perks_json")
      .eq("version", "perk_names")
      .single()
      .then(
        ({ data }) => (data?.sandbox_perks_json ?? {}) as Record<string, string>
      )
      .catch(emptyStringRecord);
  }
  return supabasePerkCachePromise;
}

export async function flushDefinitionCache(): Promise<void> {
  await Promise.all([
    (async () => {
      if (pendingDefs.size === 0) return;
      const existing = await loadSupabaseDefCache();
      const merged: Record<string, WeaponDefinition> = { ...existing };
      for (const [hash, def] of pendingDefs) merged[hash.toString()] = def;
      await adminSupabase.from("cached_manifest_metadata").upsert({
        version: "weapon_defs",
        items_json: merged,
        stats_json: {},
        damage_types_json: {},
        sandbox_perks_json: {},
      });
      pendingDefs.clear();
    })(),
    (async () => {
      if (pendingPerks.size === 0) return;
      const existing = await loadSupabasePerkCache();
      const merged: Record<string, string> = { ...existing };
      for (const [hash, name] of pendingPerks) merged[hash.toString()] = name;
      await adminSupabase.from("cached_manifest_metadata").upsert({
        version: "perk_names",
        items_json: {},
        stats_json: {},
        damage_types_json: {},
        sandbox_perks_json: merged,
      });
      pendingPerks.clear();
    })(),
  ]);
}

async function fetchWeaponDefFromBungie(
  itemHash: number
): Promise<WeaponDefinition | null> {
  try {
    const res = await fetch(
      `${BUNGIE_ROOT}/Destiny2/Manifest/DestinyInventoryItemDefinition/${itemHash}/`,
      { headers: { "X-API-Key": process.env.BUNGIE_API_KEY! } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const def = data.Response;
    if (!def || def.itemType !== 3) return null;

    const stats: Record<string, number> = {};
    for (const [hashStr, statData] of Object.entries(def.stats?.stats ?? {})) {
      const label = WEAPON_STAT_HASHES[Number(hashStr)];
      if (label) stats[label] = (statData as { value: number }).value;
    }

    return {
      itemHash,
      name: def.displayProperties?.name ?? "Unknown",
      icon: def.displayProperties?.icon
        ? `${BUNGIE_CDN}${def.displayProperties.icon}`
        : "",
      weaponType: def.itemTypeDisplayName ?? "Weapon",
      ammoType: AMMO_TYPE_NAMES[def.equippingBlock?.ammoType ?? 1] ?? "Primary",
      damageType: DAMAGE_TYPE_NAMES[def.defaultDamageTypeHash ?? 0] ?? "Kinetic",
      tierName: TIER_NAMES[def.inventory?.tierType ?? 5] ?? "Legendary",
      tierType: def.inventory?.tierType ?? 5,
      flavorText: def.flavorText ?? "",
      defaultBucketHash: def.inventory?.bucketTypeHash ?? 0,
      collectibleHash: def.collectibleHash ?? undefined,
      stats,
      intrinsicPerk: def.itemTypeDisplayName ?? null,
    };
  } catch {
    return null;
  }
}

export async function getWeaponDefinitions(
  hashes: number[]
): Promise<Map<number, WeaponDefinition>> {
  if (hashes.length === 0) return new Map();

  const results = new Map<number, WeaponDefinition>();
  const memMissing: number[] = [];

  for (const hash of hashes) {
    const cached = defMemCache.get(hash);
    if (cached) {
      results.set(hash, cached);
    } else {
      memMissing.push(hash);
    }
  }
  if (memMissing.length === 0) return results;

  const supabaseCache = await loadSupabaseDefCache();
  const bungieNeeded: number[] = [];

  for (const hash of memMissing) {
    const cached = supabaseCache[hash.toString()];
    if (cached) {
      results.set(hash, cached);
      defMemCache.set(hash, cached);
    } else {
      bungieNeeded.push(hash);
    }
  }
  if (bungieNeeded.length === 0) return results;

  await Promise.all(
    bungieNeeded.map(async (hash) => {
      const def = await fetchWeaponDefFromBungie(hash);
      if (def) {
        results.set(hash, def);
        defMemCache.set(hash, def);
        pendingDefs.set(hash, def);
      }
    })
  );

  return results;
}

export async function getWeaponDefinition(
  itemHash: number
): Promise<WeaponDefinition | null> {
  const map = await getWeaponDefinitions([itemHash]);
  return map.get(itemHash) ?? null;
}

async function fetchPerkNameFromBungie(hash: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${BUNGIE_ROOT}/Destiny2/Manifest/DestinyInventoryItemDefinition/${hash}/`,
      { headers: { "X-API-Key": process.env.BUNGIE_API_KEY! } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.Response?.displayProperties?.name as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function getPerkNames(hashes: number[]): Promise<Map<number, string>> {
  if (hashes.length === 0) return new Map();

  const results = new Map<number, string>();
  const memMissing: number[] = [];

  for (const hash of hashes) {
    const cached = perkMemCache.get(hash);
    if (cached !== undefined) {
      if (cached !== null) results.set(hash, cached);
    } else {
      memMissing.push(hash);
    }
  }
  if (memMissing.length === 0) return results;

  const supabaseCache = await loadSupabasePerkCache();
  const bungieNeeded: number[] = [];

  for (const hash of memMissing) {
    const cached = supabaseCache[hash.toString()];
    if (cached) {
      results.set(hash, cached);
      perkMemCache.set(hash, cached);
    } else {
      bungieNeeded.push(hash);
    }
  }
  if (bungieNeeded.length === 0) return results;

  await Promise.all(
    bungieNeeded.map(async (hash) => {
      const name = await fetchPerkNameFromBungie(hash);
      perkMemCache.set(hash, name);
      if (name) {
        results.set(hash, name);
        pendingPerks.set(hash, name);
      }
    })
  );

  return results;
}

export async function getPerkName(hash: number): Promise<string | null> {
  const map = await getPerkNames([hash]);
  return map.get(hash) ?? null;
}
