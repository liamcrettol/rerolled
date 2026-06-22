import type { ResolvedWeapon } from "@/types/weapon";
import type { WeaponSlot } from "@/types/bungie";

/**
 * Given each lobby member's weapon list, find weapon hashes every member owns.
 * Returns a map of slot → array of item hashes shared by all members.
 * Intersection is on itemHash (same weapon type/name), NOT instanceId.
 */
export function computeWeaponIntersection(
  memberWeapons: Map<string, ResolvedWeapon[]> // userId → weapons
): Record<WeaponSlot, number[]> {
  const result: Record<WeaponSlot, number[]> = {
    kinetic: [],
    energy: [],
    power: [],
  };

  if (memberWeapons.size === 0) return result;

  const slots: WeaponSlot[] = ["kinetic", "energy", "power"];

  for (const slot of slots) {
    // Build a set of hashes each member has for this slot
    const memberHashSets: Set<number>[] = [];

    for (const weapons of Array.from(memberWeapons.values())) {
      const hashes = new Set<number>(
        (weapons as ResolvedWeapon[]).filter((w) => w.slot === slot).map((w) => w.itemHash)
      );
      memberHashSets.push(hashes);
    }

    if (memberHashSets.length === 0) continue;

    // Intersection: only hashes that appear in every member's set
    const [first, ...rest] = memberHashSets;
    const shared = Array.from(first).filter((hash) =>
      rest.every((set) => set.has(hash))
    );

    result[slot] = shared;
  }

  return result;
}

/**
 * For a given shared itemHash and a specific user's weapon list,
 * find the best instance of that weapon (prefer already equipped,
 * then character inventory, then vault).
 */
export function findBestInstance(
  itemHash: number,
  userWeapons: ResolvedWeapon[]
): ResolvedWeapon | null {
  const candidates = userWeapons.filter((w) => w.itemHash === itemHash);
  if (candidates.length === 0) return null;

  // Prefer equipped > character > vault
  const equipped = candidates.find((w) => w.isEquipped);
  if (equipped) return equipped;

  const onCharacter = candidates.find((w) => w.location === "character");
  if (onCharacter) return onCharacter;

  return candidates[0];
}

/**
 * Randomly pick one hash from each slot's shared pool.
 * Returns null for a slot if no shared weapons exist.
 */
export function rollLoadout(
  intersection: Record<WeaponSlot, number[]>,
  exclude?: Partial<Record<WeaponSlot, number>> // for reroll-one
): Record<WeaponSlot, number | null> {
  const slots: WeaponSlot[] = ["kinetic", "energy", "power"];
  const result: Record<WeaponSlot, number | null> = {
    kinetic: null,
    energy: null,
    power: null,
  };

  for (const slot of slots) {
    if (exclude?.[slot] !== undefined) {
      result[slot] = exclude[slot]!;
      continue;
    }
    const pool = intersection[slot];
    if (pool.length === 0) continue;
    result[slot] = pool[Math.floor(Math.random() * pool.length)];
  }

  return result;
}
