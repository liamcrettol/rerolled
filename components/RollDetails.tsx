"use client";

import { useState } from "react";
import type { WeaponSlot } from "@/types/bungie";
import { BAR_STATS, NUM_STATS } from "./weaponShared";

export interface RollInstance {
  instanceId: string;
  location: "character" | "vault";
  perks: string[];
  stats: Record<string, number>;
  lightLevel: number;
}
export interface MemberRolls {
  userId: string;
  displayName: string;
  isMe: boolean;
  instances: RollInstance[];
}
export interface SlotRolls {
  itemHash: number;
  baseStats: Record<string, number>;
  members: MemberRolls[];
}
export type RollsData = Partial<Record<WeaponSlot, SlotRolls>>;

const SLOT_LABELS: Record<WeaponSlot, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };
const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];

function StatBars({ stats, base }: { stats: Record<string, number>; base: Record<string, number> }) {
  const bars = BAR_STATS.filter((s) => stats[s] !== undefined || base[s] !== undefined);
  const nums = NUM_STATS.filter((s) => stats[s] !== undefined || base[s] !== undefined);
  return (
    <div className="space-y-1.5">
      {bars.map((s) => {
        const val = stats[s] ?? base[s] ?? 0;
        const hasBase = base[s] !== undefined;
        const delta = hasBase ? val - base[s] : 0;
        // Segmented bar: blue up to the lower of base/value, then the difference
        // in green (perk gain) or red (perk loss) - like the in-game stat bars.
        const lo = Math.min(100, Math.max(0, Math.min(val, hasBase ? base[s] : val)));
        const hi = Math.min(100, Math.max(0, Math.max(val, hasBase ? base[s] : val)));
        return (
          <div key={s} className="flex items-center gap-2">
            <span className="text-gray-400 text-[11px] w-20 shrink-0">{s}</span>
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden flex">
              <div className="h-full bg-bungie-blue" style={{ width: `${lo}%` }} />
              {hi > lo && (
                <div className={`h-full ${delta >= 0 ? "bg-green-400" : "bg-red-500/80"}`} style={{ width: `${hi - lo}%` }} />
              )}
            </div>
            <span className="text-gray-300 text-[11px] w-6 text-right tabular-nums">{val}</span>
            <span className={`text-[10px] w-7 text-right tabular-nums ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-transparent"}`}>
              {delta > 0 ? `+${delta}` : delta < 0 ? delta : "0"}
            </span>
          </div>
        );
      })}
      {nums.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {nums.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="text-gray-400 text-[11px]">{s}</span>
              <span className="text-gray-200 text-[11px] tabular-nums font-medium">{stats[s] ?? base[s]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RollDetails({
  rolls,
  chosenInstances,
  onChooseInstance,
  favorites,
  onToggleFavorite,
  loading,
  error,
  onRetry,
}: {
  rolls: RollsData;
  // The current player's chosen instanceId per slot (for swap + apply).
  chosenInstances: Partial<Record<WeaponSlot, string>>;
  onChooseInstance: (slot: WeaponSlot, instanceId: string) => void;
  favorites?: Record<string, string>;
  onToggleFavorite?: (slot: WeaponSlot, hash: number, instanceId: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [tab, setTab] = useState<WeaponSlot>("kinetic");
  const [compare, setCompare] = useState(false);

  const present = SLOT_ORDER.filter((s) => rolls[s]);

  // Loading / error / not-yet-loaded states so the panel is always visible.
  if (present.length === 0) {
    return (
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Your Roll</h2>
          {onRetry && !loading && (
            <button onClick={onRetry} className="text-xs px-2 py-1 rounded border border-bungie-border text-gray-300 hover:border-gray-400 transition">
              Refresh
            </button>
          )}
        </div>
        <p className="text-gray-500 text-xs mt-2">
          {loading ? "Loading your rolls..." : error ? `Couldn't load rolls: ${error}` : "Roll a loadout to see your rolls."}
        </p>
      </div>
    );
  }

  const activeTab = rolls[tab] ? tab : present[0];
  const slot = rolls[activeTab]!;

  const me = slot.members.find((m) => m.isMe);
  const myInstances = me?.instances ?? [];
  const chosenId = chosenInstances[activeTab];
  const chosen = myInstances.find((i) => i.instanceId === chosenId) ?? myInstances[0];

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bungie-border flex items-center justify-between gap-2">
        <h2 className="text-white font-semibold text-sm">
          Your Roll {loading && <span className="text-gray-500 font-normal text-xs">· refreshing…</span>}
        </h2>
        <button
          onClick={() => setCompare((v) => !v)}
          className={`text-xs px-2.5 py-1 rounded border transition ${
            compare ? "border-bungie-blue bg-bungie-blue/20 text-white" : "border-bungie-border text-gray-300 hover:border-gray-400"
          }`}
        >
          {compare ? "Hide compare" : "Compare fireteam"}
        </button>
      </div>

      {/* Slot tabs */}
      <div className="flex gap-1 px-3 pt-2">
        {present.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`flex-1 py-1.5 rounded-t-lg text-xs font-semibold border-b-2 transition ${
              activeTab === s ? "border-bungie-blue text-white bg-bungie-blue/10" : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {SLOT_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {myInstances.length === 0 ? (
          <p className="text-gray-500 text-xs">You don&apos;t own this weapon - it&apos;ll be skipped on apply (or pull it from Collections).</p>
        ) : (
          <>
            {/* Swap between your own instances */}
            {myInstances.length === 1 && (
              <p className="text-gray-600 text-[10px]">You own 1 copy of this - nothing to swap.</p>
            )}
            {myInstances.length > 1 && (
              <div>
                <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1.5">
                  Swap roll - you have {myInstances.length} · ★ = favorite (auto-picked on roll)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {myInstances.map((inst, i) => {
                    const active = inst.instanceId === chosen?.instanceId;
                    const fav = favorites?.[slot.itemHash.toString()] === inst.instanceId;
                    return (
                      <div
                        key={inst.instanceId}
                        className={`flex items-center rounded border transition ${
                          active ? "border-bungie-blue bg-bungie-blue/20" : "border-bungie-border"
                        }`}
                      >
                        <button
                          onClick={() => onChooseInstance(activeTab, inst.instanceId)}
                          className={`text-xs pl-2 pr-1 py-1 transition ${active ? "text-white" : "text-gray-300 hover:text-white"}`}
                          title={inst.perks.join(", ")}
                        >
                          Roll {i + 1} {inst.location === "vault" ? "· vault" : ""}
                        </button>
                        {onToggleFavorite && (
                          <button
                            onClick={() => onToggleFavorite(activeTab, slot.itemHash, inst.instanceId)}
                            title={fav ? "Unfavorite" : "Favorite this roll"}
                            className={`px-1.5 py-1 text-xs ${fav ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"}`}
                          >
                            {fav ? "★" : "☆"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chosen roll: perks + perk-adjusted stats with deltas vs base */}
            {chosen && (
              <div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {chosen.perks.map((p) => (
                    <span key={p} className="text-[10px] bg-bungie-blue/20 border border-bungie-blue/40 text-blue-300 rounded px-1.5 py-0.5">
                      {p}
                    </span>
                  ))}
                </div>
                <StatBars stats={chosen.stats} base={slot.baseStats} />
                <p className="text-gray-600 text-[10px] mt-1.5">
                  {Object.keys(chosen.stats).length === 0
                    ? "Live perk stats unavailable - showing base values."
                    : "Green/red = perk impact vs the weapon's base stats."}
                </p>
              </div>
            )}
          </>
        )}

        {/* Compare to everyone else in the fireteam */}
        {compare && (
          <div className="pt-3 border-t border-bungie-border/60 space-y-2">
            {slot.members.map((m) => {
              const inst = m.instances[0];
              return (
                <div key={m.userId} className="bg-bungie-dark/50 rounded-lg px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-medium ${m.isMe ? "text-bungie-blue" : "text-gray-200"}`}>
                      {m.displayName}{m.isMe ? " (you)" : ""}
                    </span>
                    {!inst && <span className="text-[10px] text-gray-500">doesn&apos;t own it</span>}
                    {inst && m.instances.length > 1 && (
                      <span className="text-[10px] text-gray-500">{m.instances.length} rolls</span>
                    )}
                  </div>
                  {inst && (
                    <p className="text-[11px] text-gray-400 leading-snug mt-0.5">{inst.perks.join("  ·  ") || "no perk data"}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
