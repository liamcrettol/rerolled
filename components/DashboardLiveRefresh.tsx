"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Refreshes the dashboard (global leaderboard + hall of fame) whenever ANY game
// is recorded in ANY lobby - so games your friends play show up live, even if
// you weren't in their group.
export default function DashboardLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("global-stats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_sessions" }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "player_game_stats" }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);
  return null;
}
