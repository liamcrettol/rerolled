"use client";

import { Crown, X } from "lucide-react";
import Spinner from "@/components/Spinner";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { trimBungieName } from "@/lib/utils";
import type { PlayerStat, RoundRecord } from "@/hooks/useGameDetection";

// The lobby's stats card (#224): the dismissible post-game banner and the
// Session / Match History / Leaderboard tabs, extracted verbatim from
// LobbyRoom's stats section.

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  gamesPlayed: number;
  totalKills: number;
  avgKd: number;
  wins: number;
  losses: number;
}

export interface SessionTotal {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  rouletteWeaponKills: number;
  games: number;
}

export type StatsTab = "session" | "history" | "leaderboard";

// Running cumulative K/A/D per player across every recorded game this lobby.
function SessionTotalsTable({ totals }: { totals: SessionTotal[] }) {
  const sorted = [...totals].sort((a, b) => b.kills - a.kills);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-bungie-border">
            <th className="text-left pb-2 pr-4">Player</th>
            <th className="text-right pb-2 pr-3">K</th>
            <th className="text-right pb-2 pr-3">A</th>
            <th className="text-right pb-2 pr-3">D</th>
            <th className="text-right pb-2 pr-3">K/D</th>
            <th className="text-right pb-2">Games</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bungie-border/40">
          {sorted.map((s, i) => (
            <tr key={s.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
              <td className="py-1.5 pr-4 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {i === 0 && <Crown size={13} className="shrink-0 text-yellow-400" />}
                  {s.displayName}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right">{s.kills}</td>
              <td className="py-1.5 pr-3 text-right">{s.assists}</td>
              <td className="py-1.5 pr-3 text-right">{s.deaths}</td>
              <td className="py-1.5 pr-3 text-right">{(s.deaths > 0 ? s.kills / s.deaths : s.kills).toFixed(2)}</td>
              <td className="py-1.5 text-right text-gray-500">{s.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsTable({ stats }: { stats: PlayerStat[] }) {
  const sorted = [...stats].sort((a, b) => b.kills - a.kills);
  const hasWon = stats.some((s) => s.won != null);
  return (
    <div className="overflow-x-auto rounded-lg border border-bungie-border/60 bg-bungie-dark/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-bungie-border/60">
            <th className="text-left px-3 py-2">Player</th>
            {hasWon && <th className="text-center px-2 py-2">Result</th>}
            <th className="text-right px-2 py-2">K</th>
            <th className="text-right px-2 py-2">D</th>
            <th className="text-right px-2 py-2">A</th>
            <th className="text-right px-3 py-2">K/D</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bungie-border/40">
          {sorted.map((s, i) => (
            <tr key={s.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
              <td className="px-3 py-1.5 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {i === 0 && <Crown size={13} className="shrink-0 text-yellow-400" />}
                  {trimBungieName(s.displayName)}
                </span>
              </td>
              {hasWon && (
                <td className="px-2 py-1.5 text-center">
                  {s.won === true
                    ? <Badge tone="win" size="roomy">W</Badge>
                    : s.won === false
                    ? <Badge tone="loss" size="roomy">L</Badge>
                    : <span className="text-gray-500 text-xs">—</span>}
                </td>
              )}
              <td className="px-2 py-1.5 text-right tabular-nums">{s.kills}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.deaths}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.assists}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">{s.kd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  statsTab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  sessionTotals: SessionTotal[];
  roundHistory: RoundRecord[];
  expandedRound: string | null;
  onExpandRound: (sessionId: string | null) => void;
  leaderboard: LeaderboardEntry[] | null;
  leaderboardLoading: boolean;
  lastGameStats: PlayerStat[] | null;
  onDismissLastGame: () => void;
}

export default function LobbyStatsPanel({
  statsTab,
  onTabChange,
  sessionTotals,
  roundHistory,
  expandedRound,
  onExpandRound,
  leaderboard,
  leaderboardLoading,
  lastGameStats,
  onDismissLastGame,
}: Props) {
  return (
    <Card border="subtle" className="overflow-hidden">
      {/* Post-game dismissible banner */}
      {lastGameStats && lastGameStats.length > 0 && (() => {
        const top = [...lastGameStats].sort((a, b) => b.kills - a.kills)[0];
        const result = lastGameStats.find((s) => s.won != null)?.won ?? null;
        return (
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bungie-border/40 bg-green-900/10">
            <span className="text-xs font-semibold text-green-400">
              {result === true ? "W" : result === false ? "L" : "—"}
            </span>
            <span className="text-xs text-gray-300 flex-1 truncate inline-flex items-center gap-1.5">
              <Crown size={12} className="shrink-0 text-yellow-400" />
              {trimBungieName(top.displayName)} · {top.kills}K / {top.deaths}D
            </span>
            <button onClick={onDismissLastGame} className="text-gray-500 hover:text-gray-300 transition flex items-center"><X size={14} /></button>
          </div>
        );
      })()}

      {/* Tab bar */}
      <div className="flex border-b border-bungie-border/40">
        {(["session", "history", "leaderboard"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              statsTab === tab
                ? "border-bungie-blue text-white"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab === "session" ? "Session" : tab === "history" ? "Match History" : "Leaderboard"}
          </button>
        ))}
      </div>

      {/* Session totals */}
      {statsTab === "session" && (
        <div className="p-4">
          {sessionTotals.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 mb-3">Running K / A / D across all games this lobby</p>
              <SessionTotalsTable totals={sessionTotals} />
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No games recorded yet.</p>
          )}
        </div>
      )}

      {/* Match history */}
      {statsTab === "history" && (
        <div>
          {roundHistory.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No games recorded yet.</p>
          ) : (
            <div className="divide-y divide-bungie-border/40">
              {[...roundHistory].reverse().map((round) => {
                const isOpen = expandedRound === round.sessionId;
                const sorted = [...round.stats].sort((a, b) => b.kills - a.kills);
                const topPlayer = sorted[0];
                const teamResult = round.stats.find((s) => s.won != null)?.won ?? null;
                const time = round.playedAt
                  ? new Date(round.playedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                  : null;
                return (
                  <div key={round.sessionId}>
                    <button
                      onClick={() => onExpandRound(isOpen ? null : round.sessionId)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bungie-dark/40 transition"
                    >
                      {/* Round badge + W/L */}
                      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                        <span className="text-[11px] font-bold text-gray-300 bg-bungie-border/60 rounded px-1.5 py-0.5 leading-none tabular-nums">
                          R{round.roundNum}
                        </span>
                        {teamResult === true && <Badge tone="win">W</Badge>}
                        {teamResult === false && <Badge tone="loss">L</Badge>}
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium leading-tight truncate">
                          {round.mapName ?? "Unknown map"}
                        </p>
                        {topPlayer && (
                          <p className="text-gray-400 text-xs mt-0.5 truncate inline-flex items-center gap-1.5 max-w-full">
                            <Crown size={12} className="shrink-0 text-yellow-400" />
                            <span className="truncate">{topPlayer.displayName}</span>
                            <span className="text-gray-500"> · </span>
                            <span className="text-white tabular-nums">{topPlayer.kills}K</span>
                            <span className="text-gray-500"> / </span>
                            <span className="tabular-nums">{topPlayer.deaths}D</span>
                            <span className="text-gray-500"> / </span>
                            <span className="tabular-nums">{topPlayer.assists}A</span>
                          </p>
                        )}
                      </div>

                      {/* Time + chevron */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {time && <span className="text-gray-500 text-xs tabular-nums">{time}</span>}
                        <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 bg-bungie-dark/20">
                        {/* Rolled weapons */}
                        {round.weapons && Object.keys(round.weapons).length > 0 && (
                          <div className="mb-4 flex flex-wrap gap-2 pt-2">
                            {(["kinetic", "energy", "power"] as const).map((slot) => {
                              const w = round.weapons![slot];
                              if (!w) return null;
                              const slotColor = slot === "kinetic" ? "text-gray-300 border-gray-500/40" : slot === "energy" ? "text-bungie-blue border-bungie-blue/40" : "text-purple-300 border-purple-500/40";
                              return (
                                <div key={slot} className={`flex items-center gap-2 bg-bungie-dark border rounded-lg px-2.5 py-2 ${slotColor.split(" ")[1]}`}>
                                  {w.icon && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={`https://www.bungie.net${w.icon}`}
                                      alt=""
                                      className="w-8 h-8 rounded shrink-0"
                                    />
                                  )}
                                  <div>
                                    <p className={`text-[10px] font-semibold uppercase tracking-wide leading-none ${slotColor.split(" ")[0]}`}>{slot}</p>
                                    <p className="text-white text-xs font-medium leading-snug mt-0.5">{w.name}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <StatsTable stats={round.stats} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Global leaderboard */}
      {statsTab === "leaderboard" && (
        <div className="p-4">
          {leaderboardLoading ? (
            <p className="text-sm text-gray-500 text-center py-4 flex items-center justify-center gap-2">
              <Spinner size={14} />
              Loading...
            </p>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No games recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-bungie-border">
                    <th className="text-left pb-2 pr-2">#</th>
                    <th className="text-left pb-2 pr-4">Player</th>
                    <th className="text-right pb-2 pr-3">Games</th>
                    <th className="text-right pb-2 pr-3">W-L</th>
                    <th className="text-right pb-2">Avg K/D</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bungie-border/40">
                  {leaderboard.map((e, i) => (
                    <tr key={e.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
                      <td className="py-2 pr-2 text-gray-500 font-mono text-xs">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {i === 0 && <Crown size={13} className="shrink-0 text-yellow-400" />}
                          {e.displayName}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right">{e.gamesPlayed}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {e.wins + e.losses > 0 ? (
                          <><span className="text-green-400">{e.wins}</span><span className="text-gray-500">-</span><span className="text-red-400">{e.losses}</span></>
                        ) : <span className="text-gray-500">-</span>}
                      </td>
                      <td className="py-2 text-right">{e.avgKd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
