import type { ResolvedWeapon } from "@/types/weapon";
import type { WeaponSlot } from "@/types/bungie";

export function computeWeaponIntersection(
  memberWeapons: Map<string, ResolvedWeapon[]>
): Record<WeaponSlot, number[]> {
  const result: Record<WeaponSlot, number[]> = { kinetic: [], energy: [], power: [] };
  if (memberWeapons.size === 0) return result;

  const slots: WeaponSlot[] = ["kinetic", "energy", "power"];
  for (const slot of slots) {
    const memberHashSets: Set<number>[] = [];
    for (const weapons of Array.from(memberWeapons.values())) {
      const hashes = new Set<number>(
        (weapons as ResolvedWeapon[]).filter((w) => w.slot === slot).map((w) => w.itemHash)
      );
      memberHashSets.push(hashes);
    }
    if (memberHashSets.length === 0) continue;
    const [first, ...rest] = memberHashSets;
    result[slot] = Array.from(first).filter((hash) => rest.every((set) => set.has(hash)));
  }
  return result;
}

export function findBestInstance(
  itemHash: number,
  userWeapons: ResolvedWeapon[]
): ResolvedWeapon | null {
  const candidates = userWeapons.filter((w) => w.itemHash === itemHash);
  if (candidates.length === 0) return null;
  return (
    candidates.find((w) => w.isEquipped) ??
    candidates.find((w) => w.location === "character") ??
    candidates[0]
  );
}

// Archetype pairing rules - pair a primary with a complementary special so the
// loadout covers both ranges.
//   Short-range primary (SMG, Sidearm)        → Sniper Rifle (long-range special)
//   Long-range primary (Pulse, Scout, Bow)    → Shotgun      (close-range special)
//   Mid-range primary (Auto Rifle, Hand Cannon) → either Sniper or Shotgun
// Rules are bidirectional: keyed by whichever slot is decided first, the value
// constrains the other slot. So a rolled special pulls a fitting primary and a
// rolled primary pulls its matching special - never two specials with no primary.
// Falls back to unrestricted if none of the allowed types exist in the pool.
const ARCHETYPE_RULES: Record<string, string[]> = {
  // Primaries → complementary special(s)
  "Submachine Gun": ["Sniper Rifle"],
  "Sidearm": ["Sniper Rifle"],
  "Pulse Rifle": ["Shotgun"],
  "Scout Rifle": ["Shotgun"],
  "Combat Bow": ["Shotgun"],
  "Auto Rifle": ["Sniper Rifle", "Shotgun"],
  "Hand Cannon": ["Sniper Rifle", "Shotgun"],
  // Specials → fitting primaries (reverse direction)
  "Sniper Rifle": ["Submachine Gun", "Sidearm", "Auto Rifle", "Hand Cannon"],
  "Shotgun": ["Pulse Rifle", "Scout Rifle", "Combat Bow", "Auto Rifle", "Hand Cannon"],
};

type WeaponDetail = { weaponType: string; tierType?: number; damageType?: string; ammoType?: string; stats?: Record<string, number> };

export type RollMode = "normal" | "chaos" | "meta";

// Crucible "meta" frames for the Meta mode, identified by archetype RPM:
//   Hand Cannon - 120 (Aggressive) / 140 (Adaptive)
//   Shotgun - 55 (Aggressive) /  65 (Precision)
//   Sniper Rifle - 72 (Aggressive) /  90 (Adaptive)
// Everything else (incl. all power weapons) falls through, so the Meta pool is
// just these primaries/specials. Falls back to the full pool if a slot has none.
function isMetaWeapon(d?: WeaponDetail): boolean {
  const rpm = d?.stats?.RPM;
  if (rpm == null) return false;
  if (d!.weaponType === "Hand Cannon") return rpm === 120 || rpm === 140;
  if (d!.weaponType === "Shotgun") return rpm === 55 || rpm === 65;
  if (d!.weaponType === "Sniper Rifle") return rpm === 72 || rpm === 90;
  return false;
}

function applyPairingRule(
  pool: number[],
  pairedType: string,
  details: Record<string, WeaponDetail>,
  rules: Record<string, string[]>
): number[] {
  const allowed = rules[pairedType];
  if (!allowed) return pool;
  const filtered = pool.filter((h) => allowed.includes(details[h.toString()]?.weaponType ?? ""));
  // Fall back to full pool if no matching weapons exist (don't leave slot empty)
  return filtered.length > 0 ? filtered : pool;
}

function pick(pool: number[]): number | null {
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/**
 * Roll a loadout from the shared pool, applying archetype pairing rules
 * (see ARCHETYPE_RULES) between the kinetic and energy slots so a primary is
 * paired with a complementary special by range. Power is independent and never
 * rolls exotic, and the whole loadout is capped at one exotic.
 */
export function rollLoadout(
  intersection: Record<WeaponSlot, number[]>,
  weaponDetails: Record<string, WeaponDetail>,
  exclude?: Partial<Record<WeaponSlot, number>>,
  // Recent weapons per slot (most-recent first) to avoid repeating. Soft: if
  // avoiding the whole window would empty the pool, it relaxes to exclude as
  // many of the most-recent picks as the pool allows (always leaves ≥1).
  avoid?: Partial<Record<WeaponSlot, number[]>>,
  mode: RollMode = "normal"
): Record<WeaponSlot, number | null> {
  const dropAvoided = (pool: number[], slot: WeaponSlot): number[] => {
    const recent = avoid?.[slot];
    if (!recent?.length) return pool;
    for (let n = recent.length; n >= 1; n--) {
      const window = new Set(recent.slice(0, n));
      const without = pool.filter((h) => !window.has(h));
      if (without.length > 0) return without;
    }
    return pool;
  };
  // Treat 0 (the "your own / wildcard" sentinel) as not-kept so it can never pin
  // a slot to an empty value - a kept slot must be a real item hash.
  const keep: Partial<Record<WeaponSlot, number>> = {};
  for (const s of ["kinetic", "energy", "power"] as WeaponSlot[]) {
    const v = exclude?.[s];
    if (v !== undefined && v !== 0) keep[s] = v;
  }

  const kineticKept = keep.kinetic !== undefined;
  const energyKept = keep.energy !== undefined;

  let kineticHash: number | null = keep.kinetic ?? null;
  let energyHash: number | null = keep.energy ?? null;

  // Destiny only allows ONE exotic weapon equipped across all slots.
  const isExotic = (h: number | null | undefined) =>
    h != null && (weaponDetails[h.toString()]?.tierType ?? 5) === 6;
  // An exotic the player explicitly locked/selected (in any slot, incl. power)
  // claims the single exotic slot - every rolled slot must then stay non-exotic.
  const keptExotic = isExotic(keep.kinetic) || isExotic(keep.energy) || isExotic(keep.power);

  // Drop exotics from a pool when an exotic is already committed elsewhere.
  // Falls back to the full pool if that would empty it (don't leave a slot blank).
  const dropExoticsIf = (pool: number[], shouldDrop: boolean): number[] => {
    if (!shouldDrop) return pool;
    const nonExotic = pool.filter((h) => !isExotic(h));
    return nonExotic.length > 0 ? nonExotic : pool;
  };

  // Meta mode: restrict to the meta frames above (soft).
  const applyMeta = (pool: number[]): number[] => {
    if (mode !== "meta") return pool;
    const filtered = pool.filter((h) => isMetaWeapon(weaponDetails[h.toString()]));
    return filtered.length > 0 ? filtered : pool;
  };

  // Never run two Special-ammo weapons in the kinetic+energy slots - always
  // keep at least one Primary. (Two Primaries is allowed.) Falls back to the
  // full pool if dropping specials would empty the slot.
  const isSpecial = (h: number | null | undefined) =>
    h != null && weaponDetails[h.toString()]?.ammoType === "Special";
  const dropSpecialsIf = (pool: number[], shouldDrop: boolean): number[] => {
    if (!shouldDrop) return pool;
    const primaries = pool.filter((h) => !isSpecial(h));
    return primaries.length > 0 ? primaries : pool;
  };

  // Roll kinetic first (if not locked)
  if (!kineticKept) {
    // If energy is already locked, let its type constrain the kinetic pool
    const energyType = energyHash !== null ? weaponDetails[energyHash.toString()]?.weaponType : null;
    let kPool = applyMeta(intersection.kinetic);
    if (mode !== "chaos" && energyType) kPool = applyPairingRule(kPool, energyType, weaponDetails, ARCHETYPE_RULES);
    kPool = dropSpecialsIf(kPool, isSpecial(energyHash));
    kPool = dropExoticsIf(kPool, keptExotic || isExotic(energyHash));
    kPool = dropAvoided(kPool, "kinetic");
    kineticHash = pick(kPool);
  }

  // Roll energy (if not locked), constrained by whatever kinetic ended up as
  if (!energyKept) {
    const kineticType = kineticHash !== null ? weaponDetails[kineticHash.toString()]?.weaponType : null;
    let ePool = applyMeta(intersection.energy);
    if (mode !== "chaos" && kineticType) ePool = applyPairingRule(ePool, kineticType, weaponDetails, ARCHETYPE_RULES);
    ePool = dropSpecialsIf(ePool, isSpecial(kineticHash));
    ePool = dropExoticsIf(ePool, keptExotic || isExotic(kineticHash));
    ePool = dropAvoided(ePool, "energy");
    energyHash = pick(ePool);
  }

  // Power is always independent, and never exotic (tierType 6)
  let powerPool = intersection.power.filter(
    (h) => (weaponDetails[h.toString()]?.tierType ?? 5) !== 6
  );
  if (powerPool.length === 0) powerPool = intersection.power; // fallback if all exotics
  powerPool = applyMeta(powerPool);
  const powerHash = keep.power ?? pick(dropAvoided(powerPool, "power"));

  return { kinetic: kineticHash, energy: energyHash, power: powerHash };
}
