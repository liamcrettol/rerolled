"use client";

import type { ApplyResult } from "@/types/lobby";

const SLOT_LABELS: Record<string, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

export default function ApplyStatus({ results }: { results: ApplyResult[] }) {
  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
      <h2 className="text-white font-semibold mb-3">Loadout</h2>
      <div className="space-y-2">
        {results.map((r, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
              r.success ? "bg-green-900/30 border border-green-700/40" : "bg-red-900/30 border border-red-700/40"
            }`}
          >
            <span>{r.success ? "✅" : "❌"}</span>
            <span className="font-medium text-white">{r.display_name}</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-300 capitalize">
              {SLOT_LABELS[r.slot] ?? r.slot}
            </span>
            {r.error && (
              <span className="text-red-400 text-xs ml-auto">{r.error}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
