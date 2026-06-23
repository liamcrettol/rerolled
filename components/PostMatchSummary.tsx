"use client";

import { useEffect, useState } from "react";

interface PlayerStat {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  rouletteWeaponKills: number;
}

interface Props {
  lobbyId: string;
}

export default function PostMatchSummary({ lobbyId }: Props) {
  const [stats, setStats] = useState<PlayerStat[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.stats) setStats(data.stats);
        else setError(data.reason ?? "No match found — PGCR may still be processing. Try again in a minute.");
      })
      .catch(() => setError("Failed to fetch match data"))
      .finally(() => setLoading(false));
  }, [lobbyId]);

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-6">
      <h2 className="text-white font-semibold mb-4">Post-Match Summary</h2>

      {loading && (
        <p className="text-gray-400 text-sm text-center">Fetching match stats…</p>
      )}

      {!loading && error && (
        <p className="text-gray-400 text-sm text-center">{error}</p>
      )}

      {!loading && stats && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-bungie-border">
                <th className="text-left pb-2 pr-4">Player</th>
                <th className="text-right pb-2 pr-3">Roulette Kills</th>
                <th className="text-right pb-2 pr-3">K</th>
                <th className="text-right pb-2 pr-3">D</th>
                <th className="text-right pb-2 pr-3">A</th>
                <th className="text-right pb-2">K/D</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bungie-border/40">
              {[...stats]
                .sort((a, b) => b.rouletteWeaponKills - a.rouletteWeaponKills)
                .map((s, i) => (
                  <tr key={s.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
                    <td className="py-2 pr-4 font-medium">
                      {i === 0 ? "👑 " : ""}{s.displayName}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-bungie-blue">
                      {s.rouletteWeaponKills}
                    </td>
                    <td className="py-2 pr-3 text-right">{s.kills}</td>
                    <td className="py-2 pr-3 text-right">{s.deaths}</td>
                    <td className="py-2 pr-3 text-right">{s.assists}</td>
                    <td className="py-2 text-right">{s.kd.toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
