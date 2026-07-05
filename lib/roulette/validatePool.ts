// Server-side roll pool validation (#238).
//
// The roll pool is cached server-side per lobby (see migration 032). These pure
// helpers let /api/roulette/roll confirm that a client-submitted intersection
// only contains hashes the server actually computed, so a tampered request
// can't write a loadout slot for a weapon outside the valid lobby pool.

import type { WeaponSlot } from "@/types/bungie";

export interface SlotPool {
  kinetic: number[];
  energy: number[];
  power: number[];
}

const SLOTS: WeaponSlot[] = ["kinetic", "energy", "power"];

/**
 * Returns every submitted hash that is NOT present in the server-owned pool for
 * its slot. An empty array means the submitted intersection is a subset of the
 * server pool (untampered).
 */
export function findInvalidPoolHashes(
  submitted: SlotPool,
  serverPool: SlotPool,
): Array<{ slot: WeaponSlot; hash: number }> {
  const invalid: Array<{ slot: WeaponSlot; hash: number }> = [];
  for (const slot of SLOTS) {
    const allowed = new Set(serverPool[slot] ?? []);
    for (const hash of submitted[slot] ?? []) {
      if (!allowed.has(hash)) invalid.push({ slot, hash });
    }
  }
  return invalid;
}
