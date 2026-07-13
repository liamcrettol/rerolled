import { adminSupabase } from "@/lib/supabase/admin";
import Link from "next/link";
import { trimBungieName } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  games_played: number;
  total_kills: number;
  avg_kd: number;
  wins: number;
  losses: number;
}

export default async function Leaderboard() {
  const { data } = await adminSupabase
    .from("player_game_stats")
    .select("user_id, display_name, kills, kd, won");

  if (!data?.length) {
    return (
      <div className="panel">
        <div className="px-4 py-3 border-b border-bungie-border">
          <h2 className="section-label">Leaderboard</h2>
        </div>
        <EmptyState
          message="No games recorded yet."
          cta={{ label: "Run a lobby", href: "/dashboard" }}
        />
      </div>
    );
  }

  const byUser = new Map<string, LeaderboardEntry>();
  for (const row of data) {
    const existing = byUser.get(row.user_id);
    if (existing) {
      existing.total_kills += row.kills;
      existing.avg_kd =
        (existing.avg_kd * existing.games_played + row.kd) / (existing.games_played + 1);
      existing.games_played += 1;
      if (row.won === true) existing.wins += 1;
      else if (row.won === false) existing.losses += 1;
    } else {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        display_name: row.display_name,
        games_played: 1,
        total_kills: row.kills,
        avg_kd: row.kd,
        wins: row.won === true ? 1 : 0,
        losses: row.won === false ? 1 : 0,
      });
    }
  }

  const entries = [...byUser.values()].sort(
    (a, b) => b.total_kills - a.total_kills
  );

  return (
    <div className="panel">
      <div className="px-4 py-3 border-b border-bungie-border">
        <h2 className="section-label">Leaderboard</h2>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-bungie-border">
              <th className="text-left pb-2 pr-4">#</th>
              <th className="text-left pb-2 pr-4">Player</th>
              <th className="text-right pb-2 pr-3">Kills</th>
              <th className="text-right pb-2 pr-3">Games</th>
              <th className="text-right pb-2 pr-3">W-L</th>
              <th className="text-right pb-2">Avg K/D</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bungie-border/40">
            {entries.map((e, i) => (
              <tr
                key={e.user_id}
                className={`transition-colors hover:bg-white/[0.03] ${
                  i === 0 ? "text-yellow-400 bg-yellow-400/5" : "text-gray-300"
                }`}
              >
                <td className="py-2 pr-4 text-gray-500 font-mono">{i + 1}</td>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/stats/${e.user_id}`} className="hover:text-bungie-blue transition">
                    {e.display_name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right font-bold text-bungie-blue">
                  {e.total_kills}
                </td>
                <td className="py-2 pr-3 text-right">{e.games_played}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {e.wins + e.losses > 0 ? (
                    <><span className="text-green-400">{e.wins}</span>
                    <span className="text-gray-500">-</span>
                    <span className="text-red-400">{e.losses}</span></>
                  ) : (
                    <span className="text-gray-500"> - </span>
                  )}
                </td>
                <td className="py-2 text-right">{e.avg_kd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
