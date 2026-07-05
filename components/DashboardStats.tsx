import { adminSupabase } from "@/lib/supabase/admin";
import Image from "next/image";
import AnimatedNumber from "./AnimatedNumber";

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

  if (!gamesTracked && !statsRows?.length) return null;

  const totalKills = (statsRows ?? []).reduce((sum, r) => sum + r.kills, 0);
  const players = new Set((statsRows ?? []).map((r) => r.user_id)).size;
  const topWeapon = topWeaponRows?.[0];

  const cards = [
    { label: "Games tracked", value: gamesTracked ?? 0 },
    { label: "Total kills", value: totalKills },
    { label: "Players", value: players },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <div
          key={c.label}
          className="armory-card p-4 animate-rise-in"
          style={{ animationDelay: `${i * 80}ms`, opacity: 0 }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1">{c.label}</p>
          <p className="font-mono text-2xl font-black text-white tabular-nums">
            <AnimatedNumber value={c.value} />
          </p>
        </div>
      ))}
      {topWeapon && (
        <div
          className="armory-card p-4 flex items-center gap-3 animate-rise-in"
          style={{ animationDelay: `${cards.length * 80}ms`, opacity: 0 }}
        >
          <div className="relative w-9 h-9 shrink-0 rounded overflow-hidden bg-bungie-dark">
            {topWeapon.weapon_icon && (
              <Image src={topWeapon.weapon_icon} alt="" fill className="object-cover" unoptimized />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-gray-400 text-xs mb-0.5">Top weapon</p>
            <p className="text-white text-sm font-semibold truncate">{topWeapon.weapon_name ?? "Unknown"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
