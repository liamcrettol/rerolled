import { adminSupabase } from "@/lib/supabase/admin";

const BUNGIE_ROOT = "https://www.bungie.net";
const BUNGIE_PLATFORM = "https://www.bungie.net/Platform";
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

// ── Weapons-only definition table ─────────────────────────────────────────────
// Built once from Bungie's manifest, filtered to weapons (itemType === 3), and
// cached in Supabase keyed by the manifest version. Memoized per serverless
// instance via a reused Promise. Non-weapon items are simply ABSENT from the
// table, so "is this a weapon?" is an O(1) map lookup with zero per-item Bungie
// calls — this is what makes a full vault load fast instead of fetching a
// definition for every armor piece / mod / material in everyone's vault.

const WEAPONS_TABLE_KEY = "weapons_table";
let weaponsTablePromise: Promise<Map<number, WeaponDefinition>> | null = null;

async function getManifestInfo(): Promise<{ version: string; itemPath: string }> {
  const res = await fetch(`${BUNGIE_PLATFORM}/Destiny2/Manifest/`, {
    headers: { "X-API-Key": process.env.BUNGIE_API_KEY! },
    next: { revalidate: 3600 },
  });
  const json = await res.json();
  const version: string = json.Response.version;
  const itemPath: string =
    json.Response.jsonWorldComponentContentPaths.en.DestinyInventoryItemDefinition;
  return { version, itemPath };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractWeaponDef(itemHash: number, def: any): WeaponDefinition | null {
  if (!def || def.itemType !== 3) return null;

  const stats: Record<string, number> = {};
  for (const [hashStr, statData] of Object.entries(def.stats?.stats ?? {})) {
    const label = WEAPON_STAT_HASHES[Number(hashStr)];
    if (label) stats[label] = (statData as { value: number }).value;
  }

  return {
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
    collectibleHash: def.collectibleHash ?? undefined,
    stats,
    intrinsicPerk: def.itemTypeDisplayName ?? null,
  };
}

async function buildWeaponsTable(itemPath: string): Promise<Record<string, WeaponDefinition>> {
  const res = await fetch(`${BUNGIE_ROOT}${itemPath}`);
  if (!res.ok) throw new Error(`Manifest item table download failed: ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allItems: Record<string, any> = await res.json();

  const table: Record<string, WeaponDefinition> = {};
  for (const [hashStr, def] of Object.entries(allItems)) {
    const wd = extractWeaponDef(Number(hashStr), def);
    if (wd) table[hashStr] = wd;
  }
  return table;
}

function toMap(rec: Record<string, WeaponDefinition>): Map<number, WeaponDefinition> {
  const m = new Map<number, WeaponDefinition>();
  for (const [k, v] of Object.entries(rec)) m.set(Number(k), v);
  return m;
}

function loadWeaponsTable(): Promise<Map<number, WeaponDefinition>> {
  if (!weaponsTablePromise) {
    weaponsTablePromise = (async () => {
      try {
        const { version, itemPath } = await getManifestInfo();

        // Reuse the cached compact table if it matches the current manifest version.
        const { data } = await adminSupabase
          .from("cached_manifest_metadata")
          .select("items_json, stats_json")
          .eq("version", WEAPONS_TABLE_KEY)
          .maybeSingle();

        const cachedVersion = (data?.stats_json as { manifestVersion?: string } | null)
          ?.manifestVersion;
        if (data?.items_json && cachedVersion === version) {
          return toMap(data.items_json as Record<string, WeaponDefinition>);
        }

        // Rebuild from the full manifest (rare — only when Bungie ships an update).
        const table = await buildWeaponsTable(itemPath);
        await adminSupabase.from("cached_manifest_metadata").upsert({
          version: WEAPONS_TABLE_KEY,
          items_json: table,
          stats_json: { manifestVersion: version },
          damage_types_json: {},
          sandbox_perks_json: {},
        });
        return toMap(table);
      } catch {
        // Degrade gracefully — callers treat a missing def as "not a weapon".
        // Don't cache the failure so the next request can retry.
        weaponsTablePromise = null;
        return new Map<number, WeaponDefinition>();
      }
    })();
  }
  return weaponsTablePromise;
}

export async function getWeaponDefinitions(
  hashes: number[]
): Promise<Map<number, WeaponDefinition>> {
  if (hashes.length === 0) return new Map();
  const table = await loadWeaponsTable();
  const result = new Map<number, WeaponDefinition>();
  for (const hash of hashes) {
    const def = table.get(hash);
    if (def) result.set(hash, def);
  }
  return result;
}

export async function getWeaponDefinition(
  itemHash: number
): Promise<WeaponDefinition | null> {
  const table = await loadWeaponsTable();
  return table.get(itemHash) ?? null;
}

// ── Perk name lookups ─────────────────────────────────────────────────────────
// Perk plug names are resolved per-hash with a 3-level cache. Unlike vault
// definitions, this only runs for the caller's own intersection weapons (a small
// set), and perk names always resolve to a value, so the cache is effective.

const perkMemCache = new Map<number, string | null>();
let supabasePerkCachePromise: Promise<Record<string, string>> | null = null;
const pendingPerks = new Map<number, string>();

function loadSupabasePerkCache(): Promise<Record<string, string>> {
  if (!supabasePerkCachePromise) {
    supabasePerkCachePromise = (async () => {
      try {
        const { data } = await adminSupabase
          .from("cached_manifest_metadata")
          .select("sandbox_perks_json")
          .eq("version", "perk_names")
          .single();
        return (data?.sandbox_perks_json ?? {}) as Record<string, string>;
      } catch {
        return {};
      }
    })();
  }
  return supabasePerkCachePromise;
}

// Call at the end of a request to persist newly-resolved perk names.
export async function flushDefinitionCache(): Promise<void> {
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
}

async function fetchPerkNameFromBungie(hash: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${BUNGIE_PLATFORM}/Destiny2/Manifest/DestinyInventoryItemDefinition/${hash}/`,
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
