"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PlayerStat {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  rouletteWeaponKills: number;
  won?: boolean | null;
}

export interface RoundRecord {
  sessionId: string;
  playedAt: string;
  roundNum: number;
  stats: PlayerStat[];
  weapons?: Record<string, { name: string; icon: string }>;
  mapName?: string | null;
}

// How often each client checks Bungie for the finished game. The PGCR can take
// a couple minutes to appear on Bungie's side, and every fireteam member that
// has the page open can poll. Keep this conservative so one lobby does not
// multiply into a steady database/API load spike.
export const POLL_INTERVAL_MS = 60_000;

// Owns the match-detection polling lifecycle for a lobby: checking whether the
// applied loadout's game has finished (via PGCR), recording it, and keeping
// round history in sync. Runs its own dedicated realtime channel for
// `game_sessions` inserts, separate from the lobby's main channel, so this
// concern's subscription lifecycle doesn't get tangled up with membership/slot
// updates.
export function useGameDetection({
  lobbyId,
  status,
  onSwitchToHistoryTab,
}: {
  lobbyId: string;
  status: string;
  onSwitchToHistoryTab?: () => void;
}) {
  const supabase = createClient();
  const [polling, setPolling] = useState(false);
  const [lastGameStats, setLastGameStats] = useState<PlayerStat[] | null>(null);
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read inside the realtime channel callback, which is only set up once (see
  // the eslint-disabled effect below) so a plain closure over `lastGameStats`
  // would always see its value at mount time, not the current one.
  const lastGameStatsRef = useRef<PlayerStat[] | null>(null);
  useEffect(() => { lastGameStatsRef.current = lastGameStats; }, [lastGameStats]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  const fetchHistory = useCallback(async (switchTab?: boolean) => {
    const res = await fetch(`/api/stats/history?lobbyId=${lobbyId}`);
    const data = await res.json();
    if (data.rounds) {
      setRoundHistory(data.rounds);
      if (data.rounds.length > 0) {
        setExpandedRound(data.rounds[data.rounds.length - 1].sessionId);
        if (switchTab) onSwitchToHistoryTab?.();
      }
    }
  }, [lobbyId, onSwitchToHistoryTab]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const detectGameEnd = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId }),
      });
      const data = await res.json();
      if (data.done && data.stats) {
        stopPolling();
        setLastGameStats(data.stats);
        fetchHistory(true);
        // Per-round state is cleared by LobbyRoom's roundId-change effect.
      }
      // If a game is pending but not yet found, return whether we should poll
      return data.pending ?? false;
    } catch {
      // ignore poll errors
      return false;
    }
  }, [lobbyId, stopPolling, fetchHistory]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setPolling(true);
    detectGameEnd();
    pollTimerRef.current = setInterval(detectGameEnd, POLL_INTERVAL_MS);
  }, [detectGameEnd]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // When a loadout is applied (status flips to in_game, seen via realtime by
  // every member), everyone starts polling - so whoever's PGCR appears first
  // records it and pushes to the rest. startPolling is a no-op if already running.
  useEffect(() => {
    if (status === "in_game") startPolling();
  }, [status, startPolling]);

  // On mount: check if a game was in progress when everyone left the lobby.
  // If detect says pending=true, start polling so we catch up automatically.
  useEffect(() => {
    detectGameEnd().then((pending) => {
      if (pending) startPolling();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${lobbyId}:game-detection`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_sessions", filter: `lobby_id=eq.${lobbyId}` },
        () => {
          // Refresh history for all clients when a new game is logged
          fetchHistory();
          if (!lastGameStatsRef.current) detectGameEnd();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  return { polling, lastGameStats, setLastGameStats, roundHistory, expandedRound, setExpandedRound, fetchHistory, startPolling, stopPolling };
}
