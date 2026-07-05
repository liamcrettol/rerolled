"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;
export type SupabaseChannel = ReturnType<SupabaseClient["channel"]>;

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
): { channelRef: React.MutableRefObject<SupabaseChannel | null>; supabase: SupabaseClient } {
  const supabase = useMemo(() => createClient(), []);
  const channelRef = useRef<SupabaseChannel | null>(null);

  useEffect(() => {
    const channel = supabase.channel(channelName);
    configure(channel, supabase);
    channel.subscribe();
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

  return { channelRef, supabase };
}
