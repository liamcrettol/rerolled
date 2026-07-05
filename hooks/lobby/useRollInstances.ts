"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RollsData } from "@/components/RollDetails";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

// Per-player roll data for the current loadout (#224): everyone's owned
// instances of each rolled weapon, the instance THIS player chose to equip
// per slot, persisted favorites, and the captain's per-slot browser picks.

export function useRollInstances(lobbyId: string, roundId: string | null, slots: LobbyLoadoutSlot[]) {
  const [rollsData, setRollsData] = useState<RollsData>({});
  const [myChosenInstances, setMyChosenInstances] = useState<Partial<Record<WeaponSlot, string>>>({});
  const [rollsLoading, setRollsLoading] = useState(false);
  const [rollsError, setRollsError] = useState<string | null>(null);
  // Favorited roll per weapon hash (weaponHash -> instanceId), persisted. When a
  // weapon is randomized, the player's favorited instance is auto-selected.
  const [favorites, setFavorites] = useState<Record<string, string>>({});
  // The captain's per-slot instance picks from the weapon browser — the apply
  // fallback for players who haven't chosen their own instance.
  const [preferredInstances, setPreferredInstances] = useState<Partial<Record<WeaponSlot, string>>>({});

  // Load/save favorited rolls.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gr_fav_rolls");
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("gr_fav_rolls", JSON.stringify(favorites));
    } catch {
      /* ignore */
    }
  }, [favorites]);

  const favoritesRef = useRef(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const toggleFavorite = useCallback((slot: WeaponSlot, hash: number, instanceId: string) => {
    const key = hash.toString();
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[key] === instanceId) delete next[key];
      else next[key] = instanceId;
      return next;
    });
    // Favoriting also selects it for this slot right away.
    setMyChosenInstances((prev) => ({ ...prev, [slot]: instanceId }));
  }, []);

  const handleChooseInstance = useCallback((slot: WeaponSlot, instanceId: string) => {
    setMyChosenInstances((prev) => ({ ...prev, [slot]: instanceId }));
  }, []);

  // Fetch every member's rolls (their instances + perk-adjusted stats) for the
  // current loadout, so each player sees THEIR own roll and can compare/swap.
  const fetchRolls = useCallback(async () => {
    if (!roundId) return;
    setRollsLoading(true);
    setRollsError(null);
    try {
      const res = await fetch("/api/roulette/rolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId, roundId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRollsError(data.error ?? "Failed to load rolls");
        setRollsLoading(false);
        return;
      }
      const next: RollsData = data.slots ?? {};
      setRollsData(next);
      // Default each slot to my best instance (prefer one already on a character),
      // keeping any still-valid existing choice.
      setMyChosenInstances((prev) => {
        const out: Partial<Record<WeaponSlot, string>> = {};
        for (const s of ["kinetic", "energy", "power"] as WeaponSlot[]) {
          const mine = next[s]?.members.find((m) => m.isMe)?.instances ?? [];
          if (mine.length === 0) continue;
          // Priority: favorited roll for this weapon > still-valid prior choice > best available.
          const favId = favoritesRef.current[(next[s]?.itemHash ?? 0).toString()];
          const favOwned = favId && mine.some((i) => i.instanceId === favId);
          const keep = prev[s] && mine.some((i) => i.instanceId === prev[s]);
          out[s] = favOwned
            ? favId
            : keep
            ? prev[s]!
            : (mine.find((i) => i.location === "character") ?? mine[0]).instanceId;
        }
        return out;
      });
    } catch (e) {
      setRollsError(e instanceof Error ? e.message : "Failed to load rolls");
    }
    setRollsLoading(false);
  }, [lobbyId, roundId]);

  // Refetch whenever the rolled loadout actually changes.
  const slotKey = (["kinetic", "energy", "power"] as WeaponSlot[])
    .map((s) => slots.find((x) => x.slot === s)?.item_hash ?? 0)
    .join(",");
  useEffect(() => {
    if (roundId && slots.some((s) => s.item_hash !== 0)) fetchRolls();
    else setRollsData({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, slotKey]);

  return {
    rollsData,
    myChosenInstances,
    rollsLoading,
    rollsError,
    favorites,
    toggleFavorite,
    handleChooseInstance,
    preferredInstances,
    setPreferredInstances,
    fetchRolls,
    slotKey,
  };
}
