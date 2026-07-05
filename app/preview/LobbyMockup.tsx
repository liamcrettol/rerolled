"use client";
import { useState } from "react";

const LAST_GAME = [
  { id: "1", name: "ArcStrike7",   rk: 16, k: 24, d: 3,  a: 10, kd: 8.00 },
  { id: "2", name: "VoidWalker_X", rk: 10, k: 17, d: 6,  a: 4,  kd: 2.83 },
  { id: "3", name: "SolarFlare99", rk: 9,  k: 16, d: 7,  a: 5,  kd: 2.29 },
  { id: "4", name: "GhostWhisper", rk: 6,  k: 12, d: 9,  a: 4,  kd: 1.33 },
];

const ROUNDS = [
  {
    id: "r5", num: 5, top: "ArcStrike7", topKills: 16,
    stats: [
      { id: "1", name: "ArcStrike7",   rk: 16, k: 24, d: 3,  a: 10, kd: 8.00 },
      { id: "2", name: "VoidWalker_X", rk: 10, k: 17, d: 6,  a: 4,  kd: 2.83 },
      { id: "3", name: "SolarFlare99", rk: 9,  k: 16, d: 7,  a: 5,  kd: 2.29 },
      { id: "4", name: "GhostWhisper", rk: 6,  k: 12, d: 9,  a: 4,  kd: 1.33 },
    ],
  },
  {
    id: "r4", num: 4, top: "GhostWhisper", topKills: 18,
    stats: [
      { id: "4", name: "GhostWhisper", rk: 18, k: 26, d: 2,  a: 11, kd: 13.00 },
      { id: "3", name: "SolarFlare99", rk: 14, k: 22, d: 5,  a: 9,  kd: 4.40 },
      { id: "2", name: "VoidWalker_X", rk: 7,  k: 14, d: 9,  a: 5,  kd: 1.56 },
      { id: "1", name: "ArcStrike7",   rk: 5,  k: 10, d: 11, a: 3,  kd: 0.91 },
    ],
  },
  {
    id: "r3", num: 3, top: "VoidWalker_X", topKills: 15,
    stats: [
      { id: "2", name: "VoidWalker_X", rk: 15, k: 23, d: 4,  a: 8,  kd: 5.75 },
      { id: "1", name: "ArcStrike7",   rk: 11, k: 18, d: 6,  a: 7,  kd: 3.00 },
      { id: "3", name: "SolarFlare99", rk: 6,  k: 12, d: 9,  a: 3,  kd: 1.33 },
      { id: "4", name: "GhostWhisper", rk: 4,  k: 9,  d: 13, a: 2,  kd: 0.69 },
    ],
  },
  {
    id: "r2", num: 2, top: "GhostWhisper", topKills: 13,
    stats: [
      { id: "4", name: "GhostWhisper", rk: 13, k: 21, d: 5,  a: 8,  kd: 4.20 },
      { id: "3", name: "SolarFlare99", rk: 11, k: 18, d: 6,  a: 7,  kd: 3.00 },
      { id: "1", name: "ArcStrike7",   rk: 9,  k: 15, d: 8,  a: 5,  kd: 1.88 },
      { id: "2", name: "VoidWalker_X", rk: 5,  k: 11, d: 11, a: 3,  kd: 1.00 },
    ],
  },
  {
    id: "r1", num: 1, top: "VoidWalker_X", topKills: 12,
    stats: [
      { id: "2", name: "VoidWalker_X", rk: 12, k: 20, d: 7,  a: 6,  kd: 2.86 },
      { id: "3", name: "SolarFlare99", rk: 8,  k: 15, d: 8,  a: 4,  kd: 1.88 },
      { id: "4", name: "GhostWhisper", rk: 7,  k: 13, d: 10, a: 4,  kd: 1.30 },
      { id: "1", name: "ArcStrike7",   rk: 3,  k: 9,  d: 14, a: 2,  kd: 0.64 },
    ],
  },
];

function StatsTable({ stats }: { stats: typeof LAST_GAME }) {
  return (
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
          {stats.map((s, i) => (
            <tr key={s.id} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
              <td className="py-2 pr-4 font-medium">{i === 0 ? "👑 " : ""}{s.name}</td>
              <td className="py-2 pr-3 text-right font-bold text-bungie-blue">{s.rk}</td>
              <td className="py-2 pr-3 text-right">{s.k}</td>
              <td className="py-2 pr-3 text-right">{s.d}</td>
              <td className="py-2 pr-3 text-right">{s.a}</td>
              <td className="py-2 text-right">{s.kd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LobbyMockup() {
  const [showLastGame, setShowLastGame] = useState(true);
  const [expanded, setExpanded] = useState<string | null>("r5");

  const fireteam = [
    { name: "VoidWalker_X", captain: true,  ready: true  },
    { name: "SolarFlare99", captain: false, ready: true  },
    { name: "ArcStrike7",   captain: false, ready: false },
    { name: "GhostWhisper", captain: false, ready: true  },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lobby</h1>
          <p className="text-gray-400 text-sm">
            Code: <span className="font-mono text-bungie-blue font-bold tracking-widest slashed-zero">TEST01</span>
            {" "}· share with your fireteam
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Round 6</span>
          <span className="text-xs text-green-500 animate-pulse">● watching</span>
        </div>
      </div>

      {/* Last Game card */}
      {showLastGame && (
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">Last Game</h2>
            <button
              onClick={() => setShowLastGame(false)}
              className="text-gray-600 hover:text-gray-300 text-sm leading-none"
            >
              ✕
            </button>
          </div>
          <StatsTable stats={LAST_GAME} />
        </div>
      )}
      {!showLastGame && (
        <button
          onClick={() => setShowLastGame(true)}
          className="text-xs text-gray-600 hover:text-gray-400 transition"
        >
          Show last game results
        </button>
      )}

      {/* Fireteam */}
      <div className="panel p-4">
        <h2 className="text-white font-semibold mb-3">Fireteam ({fireteam.length})</h2>
        <div className="flex flex-wrap gap-3">
          {fireteam.map((m) => (
            <div
              key={m.name}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm border ${
                m.captain
                  ? "border-yellow-500 bg-yellow-500/10"
                  : "border-bungie-border bg-bungie-dark"
              }`}
            >
              {m.captain && <span>👑</span>}
              <span className={m.ready ? "text-green-400" : "text-gray-300"}>{m.name}</span>
              {m.ready && <span className="text-green-500 text-xs">✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Round History */}
      <div className="panel overflow-hidden">
        <div className="px-4 py-3 border-b border-bungie-border">
          <h2 className="text-white font-semibold text-sm">Round History</h2>
        </div>
        <div className="divide-y divide-bungie-border/40">
          {ROUNDS.map((round) => {
            const isOpen = expanded === round.id;
            return (
              <div key={round.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : round.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bungie-dark/40 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm font-medium">Round {round.num}</span>
                    <span className="text-xs text-gray-500">
                      👑 {round.top} · {round.topKills} kills
                    </span>
                  </div>
                  <span className="text-gray-600 text-xs">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <StatsTable stats={round.stats} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
