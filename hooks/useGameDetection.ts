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

// Stop polling this long after a game starts. Without a ceiling, a lobby left
// sitting in `in_game` (the PGCR never lands, everyone walked away with the tab
// open) polls once a minute forever, per open tab. A Crucible match runs ~10-12
// minutes and the PGCR follows within a couple more, so 20 minutes covers the
// real case; the detect-games cron is the backstop past that.
export const POLL_MAX_DURATION_MS = 20 * 60_000;

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
  // Polling stays logically on while the tab is hidden even though the timer is
  // disarmed, so the visibilitychange handler knows whether to re-arm.
  const pollingRef = useRef(false);
  const pollDeadlineRef = useRef(0);
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
    pollingRef.current = false;
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
    // Give up once the window has passed rather than polling a stuck lobby for
    // the lifetime of the tab.
    if (pollingRef.current && Date.now() > pollDeadlineRef.current) {
      stopPolling();
      return false;
    }
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

  // Arms the interval only when the tab is actually in view. Players spend the
  // entire match alt-tabbed into Destiny, which is exactly the window this hook
  // polls in, so gating on visibility removes most of the requests without
  // changing what anyone sees: the realtime game_sessions INSERT still pushes
  // the result to every open client, and becoming visible checks immediately.
  const armPollTimer = useCallback(() => {
    if (pollTimerRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    pollTimerRef.current = setInterval(detectGameEnd, POLL_INTERVAL_MS);
  }, [detectGameEnd]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    pollDeadlineRef.current = Date.now() + POLL_MAX_DURATION_MS;
    setPolling(true);
    detectGameEnd();
    armPollTimer();
  }, [detectGameEnd, armPollTimer]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    function onVisibilityChange() {
      if (!pollingRef.current) return;
      if (document.visibilityState === "hidden") {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        return;
      }
      // Back in view: check right away so the result is on screen by the time
      // the player has finished tabbing over, then resume the interval.
      detectGameEnd();
      armPollTimer();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [detectGameEnd, armPollTimer]);

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
