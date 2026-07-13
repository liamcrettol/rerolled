import { adminSupabase } from "@/lib/supabase/admin";
import Image from "next/image";
import EmptyState from "@/components/ui/EmptyState";

interface HallOfFameTop {
  weapon_name: string | null;
  weapon_icon: string | null;
}

// Site-wide (not per-user) headline numbers, aggregated from the same tables
// Leaderboard.tsx and WeaponHallOfFame.tsx already read from.
export default async function DashboardStats() {
  const [{ count: gamesTracked }, { data: statsRows }, { data: topWeaponRows }] = await Promise.all([
    adminSupabase.from("game_sessions").select("*", { count: "exact", head: true }),
    adminSupabase.from("player_game_stats").select("user_id, kills"),
    adminSupabase.rpc("get_weapon_hall_of_fame", { p_limit: 1 }) as unknown as Promise<{
      data: HallOfFameTop[] | null;
    }>,
  ]);

  if (!gamesTracked && !statsRows?.length) {
    return (
      <div className="panel">
        <EmptyState
          message="No roulette runs recorded yet."
          cta={{ label: "Run a lobby", href: "/dashboard" }}
        />
      </div>
    );
  }

  const totalKills = (statsRows ?? []).reduce((sum, r) => sum + r.kills, 0);
  const players = new Set((statsRows ?? []).map((r) => r.user_id)).size;
  const topWeapon = topWeaponRows?.[0];

  const cards = [
    { label: "Games", value: gamesTracked ?? 0 },
    { label: "Kills", value: totalKills },
    { label: "Players", value: players },
  ];

  return (
    <div className="panel grid grid-cols-2 sm:grid-cols-4 divide-x divide-bungie-border">
      {cards.map((c) => (
        <div key={c.label} className="p-4">
          <p className="section-label mb-1">{c.label}</p>
          <p className="text-2xl font-bold text-white tabular-nums">{c.value.toLocaleString()}</p>
        </div>
      ))}
      {topWeapon && (
        <div className="p-4 flex items-center gap-3">
          <div className="relative w-9 h-9 shrink-0 overflow-hidden bg-bungie-dark border border-bungie-border">
            {topWeapon.weapon_icon && (
              <Image src={topWeapon.weapon_icon} alt="" fill className="object-cover" unoptimized />
            )}
          </div>
          <div className="min-w-0">
            <p className="section-label mb-0.5">Top weapon</p>
            <p className="text-white text-sm font-semibold truncate">{topWeapon.weapon_name ?? "Unknown"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
