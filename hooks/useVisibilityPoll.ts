"use client";

import { useEffect, useRef } from "react";

// Visibility-gated polling (#352). Runs `callback` every `intervalMs`, but
// ONLY while the tab is actually visible: the interval is cleared when the tab
// is hidden/backgrounded and restarted (with one immediate catch-up call) when
// it becomes visible again.
//
// Why: the lobby/draft boards poll their state endpoints as a realtime
// fallback for clients that can't reach *.supabase.co (adblock/Brave). The old
// code polled unconditionally every 3s for the whole life of the tab, so a
// lobby left open in a background tab kept firing ~1,200 invocations/hour
// forever - the dominant driver of the Vercel function-invocation + Fluid CPU
// spend. A hidden tab's user isn't looking, and the realtime websocket still
// delivers updates in the background; on return to visible we do an immediate
// tick so nothing feels stale.
//
// `enabled=false` stops polling entirely (e.g. once a lobby/draft is done).
export function useVisibilityPoll(
  callback: () => void,
  intervalMs: number,
  enabled = true
) {
  // Always call the latest callback without re-arming the interval each render
  // (standard useInterval pattern - the interval reads through this ref).
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval !== null) return;
      interval = setInterval(() => savedCallback.current(), intervalMs);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        savedCallback.current(); // immediate catch-up on refocus
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [enabled, intervalMs]);
}
