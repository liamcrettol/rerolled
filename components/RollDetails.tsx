"use client";

import { useState } from "react";
import type { WeaponSlot } from "@/types/bungie";
import { BAR_STATS, NUM_STATS, damageTheme } from "./weaponShared";

export interface Perk { name: string; description: string }
export interface RollInstance {
  instanceId: string;
  location: "character" | "vault";
  perkHashes: number[];
  perks: Perk[];
  perkIcons: Record<number, string>;
  barrelHash?: number;
  barrelName?: string;
  barrelIcon?: string;
  magazineHash?: number;
  magazineName?: string;
  magazineIcon?: string;
  masterworkHash?: number;
  masterworkName?: string;
  masterworkIcon?: string;
  stats: Record<string, number>;
  lightLevel: number;
}
export interface MemberRolls {
  userId: string;
  displayName: string;
  isMe: boolean;
  instances: RollInstance[];
  failed?: boolean;
}
export interface SlotRolls {
  itemHash: number;
  damageType: string;
  baseStats: Record<string, number>;
  members: MemberRolls[];
}
export type RollsData = Partial<Record<WeaponSlot, SlotRolls>>;

const SLOT_LABELS: Record<WeaponSlot, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };
const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];

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
  chosenInstances: Partial<Record<WeaponSlot, string>>;
  onChooseInstance: (slot: WeaponSlot, instanceId: string) => void;
  favorites?: Record<string, string>;
  onToggleFavorite?: (slot: WeaponSlot, hash: number, instanceId: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [tab, setTab] = useState<WeaponSlot>("kinetic");

  const present = SLOT_ORDER.filter((s) => rolls[s]);

  if (present.length === 0) {
    return (
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Your Roll vs Fireteam</h2>
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
  const theme = damageTheme(slot.damageType);
  const base = slot.baseStats;

  // The instance shown per member: you = your chosen pick, others = their first.
  const me = slot.members.find((m) => m.isMe);
  const myInstances = me?.instances ?? [];
  const chosenId = chosenInstances[activeTab];
  const myChosen = myInstances.find((i) => i.instanceId === chosenId) ?? myInstances[0];
  const shownFor = (m: MemberRolls): RollInstance | undefined =>
    m.isMe ? myChosen : m.instances[0];

  const members = slot.members;
  const statRows = BAR_STATS.filter((s) => base[s] !== undefined || members.some((m) => shownFor(m)?.stats[s] !== undefined));
  const numRows = NUM_STATS.filter((s) => base[s] !== undefined || (myChosen && myChosen.stats[s] !== undefined));

  // Fixed-width member columns (centered) so bars stay a readable size instead
  // of stretching across the whole panel when only one player is loaded.
  const gridCols = { gridTemplateColumns: `5.5rem repeat(${members.length}, 15rem)`, width: "max-content", margin: "0 auto" };

  // Helper to render socket icons
  const renderSocketIcon = (hash: number | undefined, name: string | undefined, icon: string | undefined) => {
    if (!hash || !icon) return null;
    return (
      <img
        key={hash}
        src={icon}
        alt={name}
        title={name}
        className="w-8 h-8 rounded border border-bungie-blue/40 hover:border-bungie-blue cursor-help transition"
      />
    );
  };

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bungie-border flex items-center justify-between gap-2">
        <h2 className="text-white font-semibold text-sm">
          Your Roll vs Fireteam {loading && <span className="text-gray-500 font-normal text-xs">· refreshing…</span>}
        </h2>
        {/* Slot tabs */}
        <div className="flex gap-1">
          {present.map((s) => {
            const t = damageTheme(rolls[s]!.damageType);
            return (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition ${
                  activeTab === s ? `${t.border} ${t.bg} text-white` : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                {SLOT_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 py-3 overflow-x-auto">
        <div className="grid gap-x-3 gap-y-1 items-center" style={gridCols}>
          {/* Header row: member names (+ your swap/favorite) */}
          <div />
          {members.map((m) => {
            return (
              <div key={`h-${m.userId}`} className="text-center">
                <p className={`text-xs font-semibold truncate ${m.isMe ? theme.text : "text-gray-200"}`}>
                  {m.isMe ? "You" : m.displayName}
                </p>
                {/* Your swap chips + favorite */}
                {m.isMe && myInstances.length > 1 && (
                  <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                    {myInstances.map((ins, i) => {
                      const active = ins.instanceId === myChosen?.instanceId;
                      const fav = favorites?.[slot.itemHash.toString()] === ins.instanceId;
                      return (
                        <div key={ins.instanceId} className={`flex items-center rounded border ${active ? `${theme.border} ${theme.bg}` : "border-bungie-border"}`}>
                          <button
                            onClick={() => onChooseInstance(activeTab, ins.instanceId)}
                            className={`text-[10px] px-1.5 py-0.5 ${active ? "text-white" : "text-gray-400 hover:text-white"}`}
                            title={ins.location === "vault" ? "in vault" : "on character"}
                          >
                            {i + 1}
                          </button>
                          {onToggleFavorite && (
                            <button
                              onClick={() => onToggleFavorite(activeTab, slot.itemHash, ins.instanceId)}
                              title={fav ? "Unfavorite" : "Favorite (auto-picked on roll)"}
                              className={`px-1 text-[10px] ${fav ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"}`}
                            >
                              {fav ? "★" : "☆"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Perks row */}
          <div className="text-gray-500 text-[10px] uppercase tracking-wide self-start pt-1">Perks</div>
          {members.map((m) => {
            const inst = shownFor(m);
            return (
              <div key={`p-${m.userId}`} className="text-center px-0.5">
                {inst ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {inst.barrelIcon && (
                      <img
                        src={inst.barrelIcon}
                        alt={inst.barrelName}
                        title={inst.barrelName}
                        className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
                      />
                    )}
                    {inst.magazineIcon && (
                      <img
                        src={inst.magazineIcon}
                        alt={inst.magazineName}
                        title={inst.magazineName}
                        className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
                      />
                    )}
                    {inst.perkHashes.length > 0 ? (
                      inst.perkHashes.map((hash, i) => {
                        const icon = inst.perkIcons[hash];
                        const perk = inst.perks[i];
                        return icon ? (
                          <img
                            key={hash}
                            src={icon}
                            alt={perk?.name}
                            title={perk?.name}
                            className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
                          />
                        ) : null;
                      })
                    ) : null}
                    {inst.masterworkIcon && (
                      <img
                        src={inst.masterworkIcon}
                        alt={inst.masterworkName}
                        title={inst.masterworkName}
                        className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
                      />
                    )}
                    {!inst.barrelIcon && !inst.magazineIcon && inst.perkHashes.length === 0 && !inst.masterworkIcon && (
                      <span className="text-[11px] text-gray-500">no perk data</span>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-600" title={m.failed ? "Couldn't read their inventory - they may need to allow inventory access in their Bungie.net privacy settings" : undefined}>
                    {m.failed ? "couldn't load" : "doesn't own"}
                  </p>
                )}
              </div>
            );
          })}

          {/* Divider */}
          <div className="col-span-full h-px bg-bungie-border/50 my-1" />

          {/* Chosen roll: all sockets + perk-adjusted stats with deltas vs base */}
          {myChosen && (
            <>
              <div className="text-gray-500 text-[10px] uppercase tracking-wide self-start pt-1">Your Roll</div>
              <div className="col-span-full">
                <div className="flex flex-wrap gap-1 mb-2">
                  {renderSocketIcon(myChosen.barrelHash, myChosen.barrelName, myChosen.barrelIcon)}
                  {renderSocketIcon(myChosen.magazineHash, myChosen.magazineName, myChosen.magazineIcon)}
                  {myChosen.perkHashes.map((hash, i) => {
                    const icon = myChosen.perkIcons[hash];
                    const perk = myChosen.perks[i];
                    return renderSocketIcon(hash, perk?.name, icon);
                  })}
                  {renderSocketIcon(myChosen.masterworkHash, myChosen.masterworkName, myChosen.masterworkIcon)}
                </div>
                <p className="text-gray-600 text-[10px] mt-1.5">Green/red = perk impact vs the weapon&apos;s base stats.</p>
              </div>
            </>
          )}

          {/* Stat rows: value per member, team-best highlighted */}
          {statRows.map((s) => {
            const vals = members.map((m) => {
              const inst = shownFor(m);
              return inst ? inst.stats[s] ?? base[s] : undefined;
            });
            const max = Math.max(...vals.filter((v): v is number => v !== undefined));
            return (
              <div key={s} className="contents">
                <div className="text-gray-400 text-[11px]">{s}</div>
                {members.map((m, i) => {
                  const v = vals[i];
                  if (v === undefined) return <div key={`${s}-${m.userId}`} className="text-center text-gray-700 text-[11px]">—</div>;
                  const isBest = members.length > 1 && v === max;
                  const hasBase = base[s] !== undefined;
                  const delta = hasBase ? v - base[s] : 0;
                  // Segmented bar: element fill up to the lower of base/value, then
                  // the perk difference in green (gain) or red (loss).
                  const lo = Math.min(100, Math.max(0, Math.min(v, hasBase ? base[s] : v)));
                  const hi = Math.min(100, Math.max(0, Math.max(v, hasBase ? base[s] : v)));
                  return (
                    <div key={`${s}-${m.userId}`} className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-700/80 rounded-full overflow-hidden flex">
                        {/* neutral base + bright green/red perk diff for contrast */}
                        <div className="h-full bg-gray-400" style={{ width: `${lo}%` }} />
                        {hi > lo && (
                          <div className={`h-full ${delta >= 0 ? "bg-green-400" : "bg-red-500/80"}`} style={{ width: `${hi - lo}%` }} />
                        )}
                      </div>
                      <span className={`w-5 text-right tabular-nums text-[11px] ${isBest ? `${theme.text} font-semibold` : "text-gray-300"}`}>{v}</span>
                      {/* Always reserve the delta column so every bar lines up */}
                      <span className={`w-6 text-right text-[9px] tabular-nums ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-transparent"}`}>
                        {m.isMe && delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Intrinsic numeric stats (shared) + note */}
        {numRows.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2 border-t border-bungie-border/50">
            {numRows.map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="text-gray-500 text-[11px]">{s}</span>
                <span className="text-gray-300 text-[11px] tabular-nums font-medium">{myChosen?.stats[s] ?? base[s]}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-gray-600 text-[10px] mt-2">
          {myChosen && Object.keys(myChosen.stats).length === 0
            ? "Live perk stats unavailable - showing base values."
            : "+/- = perk impact vs base · highlighted = team best"}
        </p>
      </div>
    </div>
  );
}
