"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseChannel, type SupabaseChannel } from "@/hooks/useSupabaseChannel";

// Refreshes the dashboard whenever stats are recorded or a lobby session ends.
// The lobby subscription clears the "rejoin" banner in real-time when a session
// closes while this tab is open, without requiring a manual page reload.
export default function DashboardLiveRefresh() {
  const router = useRouter();

  const configureChannel = useCallback(
    (channel: SupabaseChannel) => {
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_sessions" }, () => router.refresh())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "player_game_stats" }, () => router.refresh())
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: "status=eq.done" }, () => router.refresh());
    },
    [router]
  );

  useSupabaseChannel("global-stats", configureChannel);
  return null;
}
