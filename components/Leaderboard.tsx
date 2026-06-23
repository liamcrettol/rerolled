import { adminSupabase } from "@/lib/supabase/admin";
import Link from "next/link";

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  games_played: number;
  total_roulette_kills: number;
  avg_kd: number;
}

export default async function Leaderboard() {
  const { data } = await adminSupabase
    .from("player_game_stats")
    .select("user_id, display_name, roulette_weapon_kills, kd");

  if (!data?.length) {
    return (
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-6 text-center">
        <p className="text-gray-500 text-sm">No games yet.</p>
      </div>
    );
  }

  const byUser = new Map<string, LeaderboardEntry>();
  for (const row of data) {
    const existing = byUser.get(row.user_id);
    if (existing) {
      existing.total_roulette_kills += row.roulette_weapon_kills;
      existing.avg_kd =
        (existing.avg_kd * existing.games_played + row.kd) / (existing.games_played + 1);
      existing.games_played += 1;
    } else {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        display_name: row.display_name,
        games_played: 1,
        total_roulette_kills: row.roulette_weapon_kills,
        avg_kd: row.kd,
      });
    }
  }

  const entries = [...byUser.values()].sort(
    (a, b) => b.total_roulette_kills - a.total_roulette_kills
  );

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Leaderboard</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-bungie-border">
              <th className="text-left pb-2 pr-4">#</th>
              <th className="text-left pb-2 pr-4">Player</th>
              <th className="text-right pb-2 pr-3">Roulette Kills</th>
              <th className="text-right pb-2 pr-3">Games</th>
              <th className="text-right pb-2">Avg K/D</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bungie-border/40">
            {entries.map((e, i) => (
              <tr key={e.user_id} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
                <td className="py-2 pr-4 text-gray-500 font-mono">{i + 1}</td>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/stats/${e.user_id}`} className="hover:text-bungie-blue transition">
                    {e.display_name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right font-bold text-bungie-blue">
                  {e.total_roulette_kills}
                </td>
                <td className="py-2 pr-3 text-right">{e.games_played}</td>
                <td className="py-2 text-right">{e.avg_kd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
