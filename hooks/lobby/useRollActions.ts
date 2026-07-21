"use client";

import { useCallback, useState } from "react";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import type { WeaponDetail } from "./useWeaponPool";

// Roll orchestration (#224): everything that turns a captain action (Roll All,
// reroll one slot, cycle a slot's mode, pick from the browser) into a
// /api/roulette/roll request with the right keep/wildcard/avoid payload.

interface UseRollActionsArgs {
  lobbyId: string;
  roundId: string | null;
  slots: LobbyLoadoutSlot[];
  intersection: Record<WeaponSlot, number[]> | null;
  effectiveIntersection: Record<WeaponSlot, number[]> | null;
  weaponDetails: Record<string, WeaponDetail>;
  rollMode: "normal" | "chaos" | "meta";
  rerollExhausted: boolean;
  noteRerollUsed: () => void;
  lockedSlots: Set<WeaponSlot>;
  setLockedSlots: React.Dispatch<React.SetStateAction<Set<WeaponSlot>>>;
  wildcardSlots: Set<WeaponSlot>;
  setWildcardSlots: React.Dispatch<React.SetStateAction<Set<WeaponSlot>>>;
  recentRollsRef: React.MutableRefObject<Record<WeaponSlot, number[]>>;
  animKindRef: React.MutableRefObject<Record<string, "roll" | "pick">>;
  setPreferredInstances: React.Dispatch<
    React.SetStateAction<Partial<Record<WeaponSlot, string>>>
  >;
  /** Dismiss the prominent last-game card when a new roll starts. */
  dismissLastGame: () => void;
  /** A weapon pick needs the double-special confirmation dialog. */
  onConfirmSpecial: (pending: {
    slot: WeaponSlot;
    hash: number;
    instanceId?: string;
    otherName: string;
  }) => void;
}

export function useRollActions({
  lobbyId,
  roundId,
  slots,
  intersection,
  effectiveIntersection,
  weaponDetails,
  rollMode,
  rerollExhausted,
  noteRerollUsed,
  lockedSlots,
  setLockedSlots,
  wildcardSlots,
  setWildcardSlots,
  recentRollsRef,
  animKindRef,
  setPreferredInstances,
  dismissLastGame,
  onConfirmSpecial,
}: UseRollActionsArgs) {
  const [rolling, setRolling] = useState(false);

  // Write a roll for an explicit wildcard set (avoids stale wildcardSlots state).
  // Keeps every slot's current real weapon except wildcards, the sentinel 0, and
  // an optional slot being rerolled. extraKeep injects additional slot→hash pairs
  // (used to restore a previous roll when leaving wildcard mode).
  const rollWithModes = useCallback(
    async (
      nextWildcards: Set<WeaponSlot>,
      rerollSlot?: WeaponSlot,
      extraKeep?: Partial<Record<WeaponSlot, number>>
    ) => {
      if (!intersection || !roundId) return;
      for (const s of ["kinetic", "energy", "power"]) animKindRef.current[s] = "roll";
      setRolling(true);
      const keep: Record<string, number> = {};
      for (const s of slots) {
        const sl = s.slot as WeaponSlot;
        if (nextWildcards.has(sl)) continue;
        if (sl === rerollSlot) continue;
        if (s.item_hash === 0) continue;
        keep[sl] = s.item_hash;
      }
      if (extraKeep) {
        for (const [sl, hash] of Object.entries(extraKeep) as [WeaponSlot, number][]) {
          if (hash && !keep[sl]) keep[sl] = hash;
        }
      }
      const avoid = { ...recentRollsRef.current };
      try {
        await fetch("/api/roulette/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lobbyId,
            roundId,
            intersection: effectiveIntersection ?? intersection,
            weaponDetails,
            keepSlots: Object.keys(keep).length > 0 ? keep : undefined,
            avoid,
            wildcardSlots: Array.from(nextWildcards),
            mode: rollMode,
          }),
        });
      } finally {
        setRolling(false);
      }
    },
    [intersection, effectiveIntersection, roundId, lobbyId, slots, weaponDetails, rollMode, animKindRef, recentRollsRef]
  );

  // Cycle a slot through Reroll Slot → Locked → Your own → Reroll Slot.
  // Locked = keep this shared weapon on Roll All. Your own = skip slot on apply
  // (each player keeps their own equipped weapon). Toggling on/off "Your own"
  // writes the change immediately so the slot grays / repopulates right away.
  const cycleSlotMode = useCallback(
    (slot: WeaponSlot) => {
      const locked = lockedSlots.has(slot);
      const wildcard = wildcardSlots.has(slot);
      if (!locked && !wildcard) {
        // Random -> Locked (no roll; current weapon stays, now pinned)
        setLockedSlots((prev) => new Set(prev).add(slot));
      } else if (locked) {
        // Locked -> Your own (write the sentinel so it grays + skips on apply)
        setLockedSlots((prev) => {
          const n = new Set(prev);
          n.delete(slot);
          return n;
        });
        const next = new Set(wildcardSlots).add(slot);
        setWildcardSlots(next);
        rollWithModes(next);
      } else {
        // Your own -> Random (restore the previous roll for this slot if we have one)
        const next = new Set(wildcardSlots);
        next.delete(slot);
        setWildcardSlots(next);
        const previousHash = recentRollsRef.current[slot][0];
        if (previousHash) {
          rollWithModes(next, undefined, { [slot]: previousHash });
        } else {
          rollWithModes(next, slot);
        }
      }
    },
    [lockedSlots, wildcardSlots, setLockedSlots, setWildcardSlots, rollWithModes, recentRollsRef]
  );

  const handleRoll = useCallback(
    async (rerollSlot?: WeaponSlot) => {
      if (!intersection || !roundId) return;
      if (rerollExhausted) return; // reroll budget spent for this round
      // Slots about to roll should animate as a spin.
      if (rerollSlot) animKindRef.current[rerollSlot] = "roll";
      else for (const s of ["kinetic", "energy", "power"]) animKindRef.current[s] = "roll";
      setRolling(true);
      // Dismiss the prominent last-game card when captain rolls for a new round
      dismissLastGame();
      const effectiveWildcards = new Set(wildcardSlots);
      if (rerollSlot) effectiveWildcards.delete(rerollSlot);
      let keepSlots: Record<string, number> | undefined;
      if (rerollSlot) {
        keepSlots = Object.fromEntries(
          slots
            .filter(
              (s) =>
                s.slot !== rerollSlot &&
                !effectiveWildcards.has(s.slot as WeaponSlot) &&
                s.item_hash !== 0
            )
            .map((s) => [s.slot, s.item_hash])
        );
      } else {
        // Roll All re-rolls every non-locked, non-wildcard slot (power included).
        const kept = slots.filter((s) => {
          if (s.item_hash === 0) return false; // never keep the wildcard sentinel
          if (effectiveWildcards.has(s.slot as WeaponSlot)) return false;
          return lockedSlots.has(s.slot as WeaponSlot);
        });
        if (kept.length > 0) keepSlots = Object.fromEntries(kept.map((s) => [s.slot, s.item_hash]));
      }
      // Avoid repeating any of the last few weapons per slot
      const avoid = { ...recentRollsRef.current };
      try {
        await fetch("/api/roulette/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lobbyId,
            roundId,
            intersection: effectiveIntersection ?? intersection,
            weaponDetails,
            rerollSlot,
            keepSlots,
            avoid,
            wildcardSlots: Array.from(effectiveWildcards),
            mode: rollMode,
          }),
        });
        noteRerollUsed();
      } finally {
        setRolling(false);
      }
    },
    [intersection, effectiveIntersection, roundId, lobbyId, slots, weaponDetails, lockedSlots, wildcardSlots, rollMode, rerollExhausted, noteRerollUsed, dismissLastGame, animKindRef, recentRollsRef]
  );

  const commitWeaponSelect = useCallback(
    async (slot: WeaponSlot, hash: number, instanceId?: string) => {
      if (!intersection || !roundId) return;
      animKindRef.current[slot] = "pick"; // animate as a manual pick, not a spin
      setRolling(true);
      dismissLastGame();
      if (instanceId) {
        setPreferredInstances((prev) => ({ ...prev, [slot]: instanceId }));
      } else {
        setPreferredInstances((prev) => {
          const n = { ...prev };
          delete n[slot];
          return n;
        });
      }
      const keep: Partial<Record<WeaponSlot, number>> = {};
      for (const s of slots) {
        if (s.item_hash !== 0) keep[s.slot as WeaponSlot] = s.item_hash;
      }
      keep[slot] = hash;
      // Destiny allows only one exotic equipped. If the captain picks an exotic,
      // release any OTHER slot that's currently exotic so it re-rolls non-exotic.
      const isExotic = (h?: number) =>
        h !== undefined && (weaponDetails[h.toString()]?.tierType ?? 5) === 6;
      if (isExotic(hash)) {
        for (const s of Object.keys(keep) as WeaponSlot[]) {
          if (s !== slot && isExotic(keep[s])) {
            delete keep[s];
            setPreferredInstances((prev) => {
              const n = { ...prev };
              delete n[s];
              return n;
            });
          }
        }
      }
      try {
        await fetch("/api/roulette/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lobbyId, roundId, intersection, weaponDetails, keepSlots: keep }),
        });
      } finally {
        setRolling(false);
      }
    },
    [intersection, roundId, lobbyId, slots, weaponDetails, dismissLastGame, setPreferredInstances, animKindRef]
  );

  const handleSelectWeapon = useCallback(
    (slot: WeaponSlot, hash: number, instanceId?: string) => {
      if (!intersection || !roundId) return;
      // Warn (don't block) if this pick would put a Special ammo weapon in both
      // kinetic and energy, since only one of those two would actually get used.
      // Skip the check when the weapon in this slot isn't actually changing (the
      // captain is just choosing a different roll/release of the same gun).
      const currentHashInSlot = slots.find((s) => s.slot === slot)?.item_hash;
      if ((slot === "kinetic" || slot === "energy") && hash !== currentHashInSlot) {
        const isSpecial = (h?: number) =>
          h !== undefined && h !== 0 && weaponDetails[h.toString()]?.ammoType === "Special";
        const otherSlot: WeaponSlot = slot === "kinetic" ? "energy" : "kinetic";
        const otherHash = slots.find((s) => s.slot === otherSlot)?.item_hash;
        if (isSpecial(hash) && isSpecial(otherHash)) {
          const otherName = weaponDetails[otherHash!.toString()]?.name ?? "your other weapon";
          onConfirmSpecial({ slot, hash, instanceId, otherName });
          return;
        }
      }
      commitWeaponSelect(slot, hash, instanceId);
    },
    [intersection, roundId, slots, weaponDetails, commitWeaponSelect, onConfirmSpecial]
  );

  return {
    rolling,
    rollWithModes,
    cycleSlotMode,
    handleRoll,
    commitWeaponSelect,
    handleSelectWeapon,
  };
}
