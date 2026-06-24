"use client";

import { useState } from "react";
import type { WeaponSlot } from "@/types/bungie";
import { BAR_STATS, NUM_STATS } from "./weaponShared";

export interface RollInstance {
  instanceId: string;
  location: "character" | "vault";
  perks: string[];
  perkHashes: number[];
  perkIcons: Record<number, string>;
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
        const delta = base[s] !== undefined ? val - base[s] : 0;
        return (
          <div key={s} className="flex items-center gap-2">
            <span className="text-gray-400 text-[11px] w-20 shrink-0">{s}</span>
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-bungie-blue rounded-full" style={{ width: `${Math.min(100, val)}%` }} />
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
}: {
  rolls: RollsData;
  // The current player's chosen instanceId per slot (for swap + apply).
  chosenInstances: Partial<Record<WeaponSlot, string>>;
  onChooseInstance: (slot: WeaponSlot, instanceId: string) => void;
}) {
  const [tab, setTab] = useState<WeaponSlot>("kinetic");
  const [compare, setCompare] = useState(false);

  const present = SLOT_ORDER.filter((s) => rolls[s]);
  if (present.length === 0) return null;
  const activeTab = rolls[tab] ? tab : present[0];
  const slot = rolls[activeTab]!;

  const me = slot.members.find((m) => m.isMe);
  const myInstances = me?.instances ?? [];
  const chosenId = chosenInstances[activeTab];
  const chosen = myInstances.find((i) => i.instanceId === chosenId) ?? myInstances[0];

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bungie-border flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">Your Roll</h2>
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
            {myInstances.length > 1 && (
              <div>
                <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1.5">
                  Swap roll - you have {myInstances.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {myInstances.map((inst, i) => {
                    const active = inst.instanceId === chosen?.instanceId;
                    return (
                      <button
                        key={inst.instanceId}
                        onClick={() => onChooseInstance(activeTab, inst.instanceId)}
                        className={`text-xs px-2 py-1 rounded border transition ${
                          active ? "border-bungie-blue bg-bungie-blue/20 text-white" : "border-bungie-border text-gray-300 hover:border-gray-400"
                        }`}
                        title={inst.perks.join(", ")}
                      >
                        Roll {i + 1} {inst.location === "vault" ? "· vault" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chosen roll: perks + perk-adjusted stats with deltas vs base */}
            {chosen && (
              <div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {chosen.perkHashes.map((hash, i) => {
                    const icon = chosen.perkIcons[hash];
                    const perkName = chosen.perks[i];
                    return icon ? (
                      <img
                        key={hash}
                        src={icon}
                        alt={perkName}
                        title={perkName}
                        className="w-8 h-8 rounded border border-bungie-blue/40 hover:border-bungie-blue cursor-help transition"
                      />
                    ) : (
                      <span key={hash} className="text-[10px] bg-bungie-blue/20 border border-bungie-blue/40 text-blue-300 rounded px-1.5 py-0.5">
                        {perkName}
                      </span>
                    );
                  })}
                </div>
                <StatBars stats={chosen.stats} base={slot.baseStats} />
                <p className="text-gray-600 text-[10px] mt-1.5">Green/red = perk impact vs the weapon&apos;s base stats.</p>
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
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {inst.perkHashes.length > 0 ? (
                        inst.perkHashes.map((hash, i) => {
                          const icon = inst.perkIcons[hash];
                          const perkName = inst.perks[i];
                          return icon ? (
                            <img
                              key={hash}
                              src={icon}
                              alt={perkName}
                              title={perkName}
                              className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
                            />
                          ) : (
                            <span key={hash} className="text-[10px] text-gray-400">
                              {perkName}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-gray-500">no perk data</span>
                      )}
                    </div>
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
