"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lobby, LobbyRollSettings, SlotMode } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

// The captain's roll preferences and per-round roll bookkeeping (#224):
// mode/limits/bans initialized from lobby.roll_settings, the per-slot
// lock/wildcard modes, the recent-roll memory that keeps rolls from
// repeating, and the debounced publish of settings for non-captains (#106).

export function useRollState(lobby: Lobby, isCaptain: boolean, currentRound: number) {
  const [rollMode, setRollMode] = useState<"normal" | "chaos" | "meta">(
    (lobby.roll_settings?.mode as "normal" | "chaos" | "meta") ?? "normal"
  );
  const [noDupMode, setNoDupMode] = useState(lobby.roll_settings?.noDup ?? false);
  const [bannedTypes, setBannedTypes] = useState<Set<string>>(
    new Set(lobby.roll_settings?.banned ?? [])
  );
  const [rerollLimit, setRerollLimit] = useState<number | null>(
    lobby.roll_settings?.rerollLimit ?? null
  );
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [lockedSlots, setLockedSlots] = useState<Set<WeaponSlot>>(new Set());
  const [wildcardSlots, setWildcardSlots] = useState<Set<WeaponSlot>>(
    new Set<WeaponSlot>(["power"])
  );

  // Every weapon rolled per slot this lobby session (most-recent first). Rolls
  // avoid everything already used in that slot until the shared pool is
  // exhausted, then start repeating from the least-recently-used.
  const recentRollsRef = useRef<Record<WeaponSlot, number[]>>({
    kinetic: [],
    energy: [],
    power: [],
  });
  // Why each slot last changed, so the loadout animates a spin (roll) vs a
  // quick pop (manual browser pick).
  const animKindRef = useRef<Record<string, "roll" | "pick">>({});

  const recordRoll = useCallback((slot: WeaponSlot, hash: number) => {
    if (!hash) return;
    const hist = recentRollsRef.current[slot];
    if (hist[0] === hash) return; // unchanged, don't duplicate
    recentRollsRef.current[slot] = [hash, ...hist.filter((h) => h !== hash)];
  }, []);

  // Reset the reroll budget at the start of each round.
  useEffect(() => {
    setRerollsUsed(0);
  }, [currentRound]);

  const rerollExhausted = rerollLimit !== null && rerollsUsed >= rerollLimit;
  const noteRerollUsed = useCallback(() => setRerollsUsed((n) => n + 1), []);

  /** Per-round slot-mode reset, called when the round advances. */
  const resetForNewRound = useCallback(() => {
    setLockedSlots(new Set());
    setWildcardSlots(new Set<WeaponSlot>(["power"]));
  }, []);

  // Publish the captain's roll settings onto the lobby row so non-captains can
  // view them read-only (issue #106). The existing `lobbies` realtime
  // subscription rebroadcasts the update to every client. Debounced so a burst
  // of toggles (e.g. banning several types) collapses into a single write.
  useEffect(() => {
    if (!isCaptain) return;
    const slotModeOf = (s: WeaponSlot): SlotMode =>
      lockedSlots.has(s) ? "lock" : wildcardSlots.has(s) ? "wildcard" : "normal";
    const settings: LobbyRollSettings = {
      mode: rollMode,
      rerollLimit,
      noDup: noDupMode,
      banned: [...bannedTypes],
      slots: {
        kinetic: slotModeOf("kinetic"),
        energy: slotModeOf("energy"),
        power: slotModeOf("power"),
      },
    };
    const t = setTimeout(() => {
      fetch("/api/lobby/roll-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, settings }),
      }).catch(() => {
        /* best-effort; non-captains just won't see the latest */
      });
    }, 400);
    return () => clearTimeout(t);
  }, [isCaptain, lobby.id, rollMode, rerollLimit, noDupMode, bannedTypes, lockedSlots, wildcardSlots]);

  return {
    rollMode,
    setRollMode,
    noDupMode,
    setNoDupMode,
    bannedTypes,
    setBannedTypes,
    rerollLimit,
    setRerollLimit,
    rerollsUsed,
    rerollExhausted,
    noteRerollUsed,
    lockedSlots,
    setLockedSlots,
    wildcardSlots,
    setWildcardSlots,
    recentRollsRef,
    animKindRef,
    recordRoll,
    resetForNewRound,
  };
}
