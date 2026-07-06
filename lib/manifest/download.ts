import { adminSupabase } from "@/lib/supabase/admin";

const BUNGIE_ROOT = "https://www.bungie.net";
const MANIFEST_URL = `${BUNGIE_ROOT}/Platform/Destiny2/Manifest/`;

interface ManifestResponse {
  version: string;
  jsonWorldComponentContentPaths: {
    en: {
      DestinyInventoryItemDefinition: string;
      DestinyStatDefinition: string;
      DestinyDamageTypeDefinition: string;
      DestinyItemCategoryDefinition: string;
      DestinySandboxPerkDefinition: string;
    };
  };
}

interface CachedManifest {
  version: string;
  items: Record<string, unknown>;
  stats: Record<string, unknown>;
  damageTypes: Record<string, unknown>;
  sandboxPerks: Record<string, unknown>;
}

let memoryCache: CachedManifest | null = null;

export async function getManifest(): Promise<CachedManifest> {
  if (memoryCache) return memoryCache;

  const res = await fetch(MANIFEST_URL, {
    headers: { "X-API-Key": process.env.BUNGIE_API_KEY! },
    next: { revalidate: 3600 },
  });
  const manifestData: { Response: ManifestResponse } = await res.json();
  const { version, jsonWorldComponentContentPaths } = manifestData.Response;
  const paths = jsonWorldComponentContentPaths.en;

  // Other jobs also persist rows here, so "latest cached row" is not reliable.
  // Always look up the exact Bungie manifest version before falling back to the
  // expensive full-table download path.
  const { data: cached } = await adminSupabase
    .from("cached_manifest_metadata")
    .select("items_json, stats_json, damage_types_json, sandbox_perks_json")
    .eq("version", version)
    .maybeSingle();

  if (cached) {
    memoryCache = {
      version,
      items: cached.items_json,
      stats: cached.stats_json,
      damageTypes: cached.damage_types_json,
      sandboxPerks: cached.sandbox_perks_json,
    };
    return memoryCache;
  }

  // Download fresh manifest tables
  const [items, stats, damageTypes, sandboxPerks] = await Promise.all([
    fetchTable(paths.DestinyInventoryItemDefinition),
    fetchTable(paths.DestinyStatDefinition),
    fetchTable(paths.DestinyDamageTypeDefinition),
    fetchTable(paths.DestinySandboxPerkDefinition),
  ]);

  // Persist to DB
  await adminSupabase.from("cached_manifest_metadata").upsert({
    version,
    items_json: items,
    stats_json: stats,
    damage_types_json: damageTypes,
    sandbox_perks_json: sandboxPerks,
    cached_at: new Date().toISOString(),
  });

  memoryCache = { version, items, stats, damageTypes, sandboxPerks };
  return memoryCache;
}

async function fetchTable(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BUNGIE_ROOT}${path}`);
  return res.json();
}
