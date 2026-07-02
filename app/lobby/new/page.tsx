"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type RollMode = "normal" | "chaos" | "meta";

const WEAPON_TYPES: { label: string; types: string[] }[] = [
  {
    label: "Primary",
    types: ["Auto Rifle", "Hand Cannon", "Pulse Rifle", "Scout Rifle", "Sidearm", "Submachine Gun", "Combat Bow", "Trace Rifle"],
  },
  {
    label: "Special",
    types: ["Shotgun", "Fusion Rifle", "Sniper Rifle", "Grenade Launcher", "Glaive"],
  },
  {
    label: "Heavy",
    types: ["Rocket Launcher", "Linear Fusion Rifle", "Machine Gun", "Sword", "Grenade Launcher"],
  },
];

function PillSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none ${
        checked ? "bg-green-700 border-green-600" : "bg-bungie-dark border-bungie-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function NewLobbyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [rerollLimit, setRerollLimit] = useState<number | null>(null);
  const [noDup, setNoDup] = useState(false);
  const [bannedTypes, setBannedTypes] = useState<Set<string>>(new Set());

  function toggleBan(type: string) {
    setBannedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lobby/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            mode: rollMode,
            rerollLimit,
            noDup,
            banned: [...bannedTypes],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/lobby/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lobby");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bungie-dark">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition mb-6"
        >
          <ChevronLeft size={16} />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-white mb-1">Create Lobby</h1>
        <p className="text-gray-400 text-sm mb-8">
          Configure your roll settings, then share the lobby code with your fireteam.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
            {/* Roll Mode */}
            <div className="bg-bungie-surface border border-bungie-border rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Roll Mode</p>
              <div className="flex gap-2">
                {(["normal", "chaos", "meta"] as RollMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRollMode(m)}
                    className={`flex-1 py-2 text-sm rounded-lg border capitalize transition ${
                      rollMode === m
                        ? "border-bungie-blue bg-bungie-blue/20 text-white font-semibold"
                        : "border-bungie-border text-gray-400 hover:border-gray-400"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-2">
                {rollMode === "normal" && "Each player gets the same 3-slot loadout."}
                {rollMode === "chaos" && "Each player rolls independently — everyone gets different weapons."}
                {rollMode === "meta" && "Rolls are weighted toward higher-usage weapons."}
              </p>
            </div>

            {/* Rerolls per round */}
            <div className="bg-bungie-surface border border-bungie-border rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Rerolls per Round</p>
              <div className="flex gap-2">
                {([null, 1, 3, 5] as (number | null)[]).map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setRerollLimit(v)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition ${
                      rerollLimit === v
                        ? "border-bungie-blue bg-bungie-blue/20 text-white font-semibold"
                        : "border-bungie-border text-gray-400 hover:border-gray-400"
                    }`}
                  >
                    {v === null ? "Unlimited" : v}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-2">Rerolls are shared by the lobby for each round.</p>
            </div>

            {/* No duplicates */}
            <div className="bg-bungie-surface border border-bungie-border rounded-xl p-5">
              <label className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <p className="text-sm text-white font-medium">No duplicate weapon types</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Prevents duplicate kinetic/energy weapon types, like two Hand Cannons.
                  </p>
                </div>
                <PillSwitch checked={noDup} onChange={() => setNoDup((v) => !v)} />
              </label>
            </div>
          </div>

          {/* Ban weapon types */}
          <div className="bg-bungie-surface border border-bungie-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest text-gray-500">Ban Weapon Types</p>
              {bannedTypes.size > 0 && (
                <button
                  onClick={() => setBannedTypes(new Set())}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-3">
              {WEAPON_TYPES.map(({ label, types }) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {types.map((t) => {
                      const banned = bannedTypes.has(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleBan(t)}
                          title={banned ? `${t} is banned from rolls` : `Ban ${t}`}
                          className={`text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1 ${
                            banned
                              ? "border-red-400 bg-red-500/20 text-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.18)]"
                              : "border-bungie-border text-gray-400 hover:border-gray-400 hover:text-gray-200"
                          }`}
                        >
                          {banned && <span className="text-red-300" aria-hidden>×</span>}
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {bannedTypes.size > 0 && (
              <p className="text-[11px] text-yellow-500/70 mt-3">
                {bannedTypes.size} type{bannedTypes.size !== 1 ? "s" : ""} banned from rolling.
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center mt-6">{error}</p>}

        <p className="text-center text-xs text-gray-500 mt-6">
          <span className="capitalize text-gray-300">{rollMode}</span> mode ·{" "}
          {rerollLimit === null ? "Unlimited" : rerollLimit} reroll{rerollLimit === 1 ? "" : "s"} ·{" "}
          {bannedTypes.size} weapon type{bannedTypes.size === 1 ? "" : "s"} banned ·{" "}
          duplicates {noDup ? "not allowed" : "allowed"}
        </p>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full mt-3 bg-bungie-blue hover:opacity-90 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm"
        >
          {loading ? "Creating..." : "Create Lobby"}
        </button>
      </div>
    </div>
  );
}
