"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;
export type SupabaseChannel = ReturnType<SupabaseClient["channel"]>;

/** Whether the realtime socket is actually delivering. "connecting" is the
 *  brief pre-SUBSCRIBED window; "down" means the socket errored, timed out or
 *  closed, which is what a browser blocking *.supabase.co looks like. */
export type RealtimeHealth = "connecting" | "up" | "down";

/** Realtime is delivering, so a fallback poll is only a safety net for a rare
 *  dropped postgres_changes event. Slow is fine. */
export const POLL_MS_REALTIME_UP = 30_000;

/** Realtime is down for this user, so polling is the ONLY thing advancing
 *  their board and has to feel live. */
export const POLL_MS_REALTIME_DOWN = 5_000;

/** Poll interval a realtime fallback should use for the given health. #352
 *  stopped hidden tabs from polling; this stops the ~95% of clients whose
 *  socket is fine from polling at the same rate as the few who need it. */
export function fallbackPollMs(health: RealtimeHealth): number {
  return health === "up" ? POLL_MS_REALTIME_UP : POLL_MS_REALTIME_DOWN;
}

// Shared realtime channel lifecycle (#225): subscribe once per channel name,
// clean up on unmount/name change. Previously hand-rolled three times
// (LobbyRoom's useLobbySession, WatchView, DashboardLiveRefresh) with
// identical create-subscribe-cleanup boilerplate around genuinely different
// `.on()` registrations — this owns only the lifecycle, not the handlers.
//
// `configure` runs once per (channelName) change, inside the effect, so it's
// safe to register `.on(...)` handlers that close over the latest props/state
// each time it's called — just like the old inline effects did.
export function useSupabaseChannel(
  channelName: string,
  configure: (channel: SupabaseChannel, supabase: SupabaseClient) => void
): {
  channelRef: React.MutableRefObject<SupabaseChannel | null>;
  supabase: SupabaseClient;
  health: RealtimeHealth;
} {
  const supabase = useMemo(() => createClient(), []);
  const channelRef = useRef<SupabaseChannel | null>(null);
  const [health, setHealth] = useState<RealtimeHealth>("connecting");

  useEffect(() => {
    const channel = supabase.channel(channelName);
    configure(channel, supabase);
    setHealth("connecting");
    // The subscribe callback is the only honest signal for "is realtime
    // actually working for THIS user" - it's what the polling fallbacks read
    // to decide whether they have to carry the session or can idle.
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setHealth("up");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setHealth("down");
      }
    });
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // `configure` is expected to be re-created each render (it closes over
  // fresh state via a cbRef internally, same pattern as useLobbySession) but
  // must NOT be a dependency here — re-running this effect on every render
  // would tear down and resubscribe the channel constantly. Only the channel
  // identity (name) and the client instance should restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, supabase]);

  return { channelRef, supabase, health };
}
