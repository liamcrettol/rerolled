import type { WeaponSlot } from "@/types/bungie";

export interface WeaponUsageRow {
  slot: WeaponSlot;
  item_hash: number;
  used_at: string;
}

export interface WeaponCyclePlan {
  pools: Record<WeaponSlot, number[]>;
  /** Slots whose completed cycle must be cleared before recording this roll. */
  resets: Partial<Record<WeaponSlot, { retainHash: number | null }>>;
}

const SLOTS: WeaponSlot[] = ["kinetic", "energy", "power"];

/**
 * Remove every weapon already seen in this lobby's current per-slot cycle.
 * Usage rows must be newest-first. When a pool is exhausted, begin a new cycle
 * while retaining the last weapon as already-used so a cycle boundary cannot
 * produce an immediate repeat (unless the pool only contains one weapon).
 */
export function planWeaponCycles(
  sourcePools: Record<WeaponSlot, number[]>,
  usageRows: WeaponUsageRow[]
): WeaponCyclePlan {
  const pools = {} as Record<WeaponSlot, number[]>;
  const resets: WeaponCyclePlan["resets"] = {};

  for (const slot of SLOTS) {
    const original = [...new Set(sourcePools[slot])];
    if (original.length === 0) {
      pools[slot] = [];
      continue;
    }

    const originalSet = new Set(original);
    const slotUsage = usageRows.filter((row) => row.slot === slot && originalSet.has(row.item_hash));
    const used = new Set(slotUsage.map((row) => row.item_hash));
    const available = original.filter((hash) => !used.has(hash));

    if (available.length > 0) {
      pools[slot] = available;
      continue;
    }

    const lastHash = slotUsage[0]?.item_hash ?? null;
    const retainHash = original.length > 1 ? lastHash : null;
    resets[slot] = { retainHash };
    pools[slot] = retainHash === null
      ? original
      : original.filter((hash) => hash !== retainHash);
  }

  return { pools, resets };
}
