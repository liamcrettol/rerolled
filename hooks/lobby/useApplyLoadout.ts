"use client";

import { useCallback, useRef, useState } from "react";
import type { ApplyResult } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

// The apply/equip flow (#224): posting the loadout to /api/apply with each
// player's chosen instances, cancellation, the per-device auto-apply opt-in,
// and the captain-apply broadcast that triggers opted-in players.

interface UseApplyLoadoutArgs {
  lobbyId: string;
  roundId: string | null;
  selectedCharId: string | null;
  isCaptain: boolean;
  /** Merged instance preference: captain's browser picks overlaid with my choices. */
  getPreferredInstances: () => Partial<Record<WeaponSlot, string>>;
  sendCaptainApply: () => void;
  /** Kick off post-game detection once an apply lands. */
  startPolling: () => void;
}

export function useApplyLoadout({
  lobbyId,
  roundId,
  selectedCharId,
  isCaptain,
  getPreferredInstances,
  sendCaptainApply,
  startPolling,
}: UseApplyLoadoutArgs) {
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [applying, setApplying] = useState(false);
  // Auto-apply: when enabled, equip automatically when the captain clicks Apply.
  // Preference persisted per-device in localStorage.
  const [autoApply, setAutoApply] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("d2r_autoApply") === "true";
  });
  const applyAbortRef = useRef<AbortController | null>(null);

  const toggleAutoApply = useCallback(() => {
    setAutoApply((prev) => {
      const next = !prev;
      localStorage.setItem("d2r_autoApply", next ? "true" : "false");
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (!selectedCharId || !roundId) return;
    // Captain's Apply triggers auto-apply for opted-in players via broadcast.
    if (isCaptain) sendCaptainApply();
    const controller = new AbortController();
    applyAbortRef.current = controller;
    setApplying(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Each player equips their OWN chosen instance; fall back to the
        // captain's per-slot pick from the browser for anything unset.
        body: JSON.stringify({
          lobbyId,
          roundId,
          characterId: selectedCharId,
          preferredInstances: getPreferredInstances(),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.results) {
        setApplyResults(data.results);
        startPolling();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("Apply failed:", e);
    }
    applyAbortRef.current = null;
    setApplying(false);
  }, [selectedCharId, roundId, lobbyId, isCaptain, getPreferredInstances, sendCaptainApply, startPolling]);

  const handleCancelApply = useCallback(() => {
    applyAbortRef.current?.abort();
    applyAbortRef.current = null;
    setApplying(false);
  }, []);

  const clearApplyResults = useCallback(() => setApplyResults([]), []);

  return {
    applyResults,
    clearApplyResults,
    applying,
    autoApply,
    toggleAutoApply,
    handleApply,
    handleCancelApply,
  };
}
