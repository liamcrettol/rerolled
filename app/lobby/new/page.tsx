"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Spinner from "@/components/Spinner";

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

function BoxSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${
        checked ? "border-green-500 bg-green-500 text-black" : "border-bungie-border bg-bungie-dark"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="4">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
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

        <h1 className="text-xl font-bold uppercase tracking-wider text-white mb-6">Create Lobby</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
            {/* Roll Mode */}
            <div className="panel p-5">
              <p className="section-label mb-3">Roll Mode</p>
              <div className="flex gap-2">
                {(["normal", "chaos", "meta"] as RollMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRollMode(m)}
                    className={`flex-1 py-2 text-sm border capitalize transition ${
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
                {rollMode === "normal" && "Everyone gets the same loadout."}
                {rollMode === "chaos" && "Everyone rolls different weapons."}
                {rollMode === "meta" && "Weighted toward high-usage weapons."}
              </p>
            </div>

            {/* Rerolls per round */}
            <div className="panel p-5">
              <p className="section-label mb-3">Rerolls per Round</p>
              <div className="flex gap-2">
                {([null, 1, 3, 5] as (number | null)[]).map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setRerollLimit(v)}
                    className={`flex-1 py-2 text-sm border transition ${
                      rerollLimit === v
                        ? "border-bungie-blue bg-bungie-blue/20 text-white font-semibold"
                        : "border-bungie-border text-gray-400 hover:border-gray-400"
                    }`}
                  >
                    {v === null ? "Unlimited" : v}
                  </button>
                ))}
              </div>
            </div>

            {/* No duplicates */}
            <div className="panel p-5">
              <label className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <p className="text-sm text-white font-medium">No duplicate weapon types</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">e.g. never two Hand Cannons</p>
                </div>
                <BoxSwitch checked={noDup} onChange={() => setNoDup((v) => !v)} />
              </label>
            </div>
          </div>

          {/* Ban weapon types */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="section-label">Ban Weapon Types</p>
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
                          aria-label={banned ? `${t} is banned from rolls` : `Ban ${t}`}
                          className={`text-xs px-2.5 py-1 border transition inline-flex items-center gap-1 ${
                            banned
                              ? "border-red-400 bg-red-500/20 text-red-200"
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

          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center mt-6">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full mt-6 bg-bungie-blue hover:bg-[#26bcf3] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider py-3 transition-colors inline-flex items-center justify-center gap-2"
        >
          {loading && <Spinner size={15} />}
          {loading ? "Creating…" : "Create Lobby"}
        </button>
      </div>
    </div>
  );
}
