"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Refreshes the dashboard whenever stats are recorded or a lobby session ends.
// The lobby subscription clears the "rejoin" banner in real-time when a session
// closes while this tab is open, without requiring a manual page reload.
export default function DashboardLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("global-stats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_sessions" }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "player_game_stats" }, () => router.refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lobbies", filter: "status=eq.done" }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);
  return null;
}
