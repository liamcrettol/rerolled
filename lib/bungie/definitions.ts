// Weapon + perk definitions served from a prebuilt static table.
//
// The full Bungie DestinyInventoryItemDefinition manifest is ~190 MB - far too
// large to download and parse inside a serverless function (it times out / runs
// out of memory, so an in-request build never completes). Instead we ship a
// compact weapons-only table (~1.2 MB) and a perk-name map (~0.45 MB) generated
// offline from the manifest. Every lookup here is an instant in-memory map read
// with zero network calls.
//
// To refresh after a Bungie manifest update, regenerate these JSON files from
// the manifest (see scripts/build-weapons-table - or the one-off generator used
// to create them) and redeploy. Built from manifest version:
//   244122.26.06.10.2000-1-bnet.65386

import weaponsRaw from "./data/weapons-table.json";
import perkNamesRaw from "./data/perk-names.json";

export interface WeaponDefinition {
  itemHash: number;
  name: string;
  icon: string;
  watermark?: string;
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

const WEAPONS: Map<number, WeaponDefinition> = (() => {
  const rec = weaponsRaw as unknown as Record<string, WeaponDefinition>;
  const m = new Map<number, WeaponDefinition>();
  for (const key in rec) m.set(Number(key), rec[key]);
  return m;
})();

const PERK_NAMES = perkNamesRaw as unknown as Record<string, string>;

export async function getWeaponDefinitions(
  hashes: number[]
): Promise<Map<number, WeaponDefinition>> {
  const result = new Map<number, WeaponDefinition>();
  for (const hash of hashes) {
    const def = WEAPONS.get(hash);
    if (def) result.set(hash, def);
  }
  return result;
}

export async function getWeaponDefinition(
  itemHash: number
): Promise<WeaponDefinition | null> {
  return WEAPONS.get(itemHash) ?? null;
}

export async function getPerkNames(hashes: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  for (const hash of hashes) {
    const name = PERK_NAMES[hash.toString()];
    if (name) result.set(hash, name);
  }
  return result;
}

export async function getPerkName(hash: number): Promise<string | null> {
  return PERK_NAMES[hash.toString()] ?? null;
}

// No-op kept for call-site compatibility - definitions are now static, so there
// is nothing to flush to a cache.
export async function flushDefinitionCache(): Promise<void> {}
