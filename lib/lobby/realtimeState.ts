import type { WeaponSlot } from "@/types/bungie";
import type { LobbyLoadoutSlot } from "@/types/lobby";

// Pure state transforms shared by the lobby and watch views' realtime
// handlers (#223). Extracted so the merge semantics are testable and stay
// identical across subscribers; the views keep their own round guards.

/** Replace-or-append a loadout slot: the incoming row wins its slot. */
export function mergeSlot<T extends { slot: string }>(prev: T[], incoming: T): T[] {
  return [...prev.filter((x) => x.slot !== incoming.slot), incoming];
}

/** Insert a member, replacing any existing row with the same id (realtime can echo). */
export function upsertMember<T extends { id: string }>(prev: T[], incoming: T): T[] {
  return [...prev.filter((m) => m.id !== incoming.id), incoming];
}

/** Update a member in place; unknown ids are ignored (no phantom inserts). */
export function updateMember<T extends { id: string }>(prev: T[], incoming: T): T[] {
  return prev.map((m) => (m.id === incoming.id ? incoming : m));
}

/** Remove a member by id (DELETE payloads only carry the PK — see migration 011). */
export function removeMemberById<T extends { id: string }>(prev: T[], id: string): T[] {
  return prev.filter((m) => m.id !== id);
}

/**
 * Reconstruct wildcard slots from a round's persisted loadout rows: rows
 * stored with item_hash 0 are wildcards ("Your own"), and power defaults to
 * wildcard unless the captain explicitly rolled a real heavy.
 */
export function wildcardsFromSlots(slots: LobbyLoadoutSlot[]): Set<WeaponSlot> {
  const wc = new Set<WeaponSlot>(
    slots.filter((s) => s.item_hash === 0).map((s) => s.slot as WeaponSlot)
  );
  const hasPowerRoll = slots.some((s) => s.slot === "power" && s.item_hash !== 0);
  if (!hasPowerRoll) wc.add("power");
  return wc;
}
