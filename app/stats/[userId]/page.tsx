import { adminSupabase } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import weaponsTable from "@/lib/bungie/data/weapons-table.json";
import WeaponIcon from "@/components/WeaponIcon";

export const dynamic = "force-dynamic";

type WeaponEntry = { name: string; icon: string; watermark?: string; weaponType: string; tierName: string; tierType: number };
type GameSession = { played_at: string; roulette_hashes?: number[] };

const weapons = weaponsTable as Record<string, WeaponEntry>;

export default async function PlayerStatsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const { data: rows } = await adminSupabase
    .from("player_game_stats")
    .select("*, game_sessions(played_at, roulette_hashes)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!rows?.length) notFound();

  const displayName = rows[0].display_name;
  const totalGames = rows.length;
  const totalKills = rows.reduce((s, r) => s + r.kills, 0);
  const totalDeaths = rows.reduce((s, r) => s + r.deaths, 0);
  const totalAssists = rows.reduce((s, r) => s + r.assists, 0);
  const totalRouletteKills = rows.reduce((s, r) => s + r.roulette_weapon_kills, 0);
  const avgKD = totalDeaths > 0 ? (totalKills / totalDeaths) : totalKills;

  // Best and worst round
  const sorted = [...rows].sort((a, b) => b.roulette_weapon_kills - a.roulette_weapon_kills);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // Per-weapon kill aggregation from game_sessions roulette_hashes
  // We don't have per-player per-weapon breakdown, so we show most-rolled weapons for this player
  const hashCounts = new Map<number, number>();
  for (const row of rows) {
    const session = row.game_sessions as { roulette_hashes: number[] } | null;
    if (session?.roulette_hashes) {
      for (const h of session.roulette_hashes) {
        hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1);
      }
    }
  }
  const topWeapons = [...hashCounts.entries()]
    .map(([hash, count]) => ({ hash, count, def: weapons[hash.toString()] }))
    .filter((e) => e.def)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const TIER_COLOR: Record<number, string> = { 6: "text-yellow-400", 5: "text-purple-400", 4: "text-blue-400" };

  // Extract weapon selection logic to improve testability and maintainability
  function getMostCommonWeapon(roulette_hashes?: number[]): { weapon: WeaponEntry | null; count: number } {
    if (!roulette_hashes?.length) {
      return { weapon: null, count: 0 };
    }

    const hashFreq = new Map<number, number>();
    for (const hash of roulette_hashes) {
      hashFreq.set(hash, (hashFreq.get(hash) ?? 0) + 1);
    }

    const sortedEntries = [...hashFreq.entries()].sort((a, b) => b[1] - a[1]);
    if (sortedEntries.length === 0) {
      return { weapon: null, count: 0 };
    }

    const [mostCommonHash] = sortedEntries[0];
    return {
      weapon: weapons[mostCommonHash.toString()] ?? null,
      count: roulette_hashes.length,
    };
  }

  return (
    <main className="min-h-screen p-6 w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
          ← Dashboard
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{displayName}</h1>
        <p className="text-gray-400 text-sm mt-1">Player stats across all Gun Roulette games</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Games", value: totalGames },
          { label: "Roulette Kills", value: totalRouletteKills, highlight: true },
          { label: "Avg K/D", value: avgKD.toFixed(2) },
          { label: "Total K/D/A", value: `${totalKills}/${totalDeaths}/${totalAssists}` },
        ].map((stat) => (
          <div key={stat.label} className="bg-bungie-surface border border-bungie-border rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${stat.highlight ? "text-bungie-blue" : "text-white"}`}>{stat.value}</p>
            <p className="text-gray-500 text-xs mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Best / Worst round */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Best Round</p>
          <p className="text-yellow-400 font-bold text-lg">👑 {best.roulette_weapon_kills} kills</p>
          <p className="text-gray-400 text-sm">{best.kills}K / {best.deaths}D · {Number(best.kd).toFixed(2)} K/D</p>
        </div>
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Roughest Round</p>
          <p className="text-red-400 font-bold text-lg">{worst.roulette_weapon_kills} kills</p>
          <p className="text-gray-400 text-sm">{worst.kills}K / {worst.deaths}D · {Number(worst.kd).toFixed(2)} K/D</p>
        </div>
      </div>

      {/* Most rolled weapons */}
      {topWeapons.length > 0 && (
        <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-bungie-border">
            <h2 className="text-sm font-semibold text-white">Most Rolled Weapons</h2>
          </div>
          <div className="divide-y divide-bungie-border/40">
            {topWeapons.map((e) => (
              <div key={e.hash} className="flex items-center gap-3 px-4 py-3">
                <WeaponIcon
                  icon={e.def.icon}
                  watermark={e.def.watermark}
                  name={e.def.name}
                  size="medium"
                  count={e.count}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{e.def.name}</p>
                  <p className={`text-xs ${TIER_COLOR[e.def.tierType] ?? "text-gray-400"}`}>
                    {e.def.tierName} · {e.def.weaponType}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-bungie-blue font-bold text-sm">{e.count}×</p>
                  <p className="text-gray-500 text-xs">rolled</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game history */}
      <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-bungie-border">
          <h2 className="text-sm font-semibold text-white">Game History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-bungie-border">
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-3 py-2">Roulette Kills</th>
                <th className="text-right px-3 py-2">K</th>
                <th className="text-right px-3 py-2">D</th>
                <th className="text-right px-3 py-2">A</th>
                <th className="text-right px-4 py-2">K/D</th>
                <th className="text-left px-3 py-2">Weapons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bungie-border/40">
              {rows.map((row) => {
                const session = row.game_sessions as GameSession | null;
                const date = session?.played_at
                  ? new Date(session.played_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : " - ";

                // Get the most common weapon from this session's roulette hashes
                const { weapon: mostCommonWeapon, count: totalWeaponsRolled } = getMostCommonWeapon(session?.roulette_hashes);

                return (
                  <tr key={row.id} className="text-gray-300 hover:bg-bungie-dark/30 transition">
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{date}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-bungie-blue">{row.roulette_weapon_kills}</td>
                    <td className="px-3 py-2.5 text-right">{row.kills}</td>
                    <td className="px-3 py-2.5 text-right">{row.deaths}</td>
                    <td className="px-3 py-2.5 text-right">{row.assists}</td>
                    <td className="px-4 py-2.5 text-right">{Number(row.kd).toFixed(2)}</td>
                    <td className="px-3 py-2.5">
                      {mostCommonWeapon ? (
                        <WeaponIcon
                          icon={mostCommonWeapon.icon}
                          watermark={mostCommonWeapon.watermark}
                          name={mostCommonWeapon.name}
                          size="small"
                          count={totalWeaponsRolled}
                        />
                      ) : (
                        <span className="text-gray-500 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
