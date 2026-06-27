"use client";

import { useState } from "react";
import type { WeaponSlot } from "@/types/bungie";
import { BAR_STATS, NUM_STATS, damageTheme } from "./weaponShared";
import { trimBungieName } from "@/lib/utils";
import type { LobbyMember } from "@/types/lobby";
import PerkIcon from "./PerkIcon";
import PlayerCard from "./PlayerCard";

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
  weaponName?: string;
  weaponIcon?: string;
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
  memberCards,
  loading,
  error,
  onRetry,
}: {
  rolls: RollsData;
  chosenInstances: Partial<Record<WeaponSlot, string>>;
  onChooseInstance: (slot: WeaponSlot, instanceId: string) => void;
  favorites?: Record<string, string>;
  onToggleFavorite?: (slot: WeaponSlot, hash: number, instanceId: string) => void;
  memberCards?: Record<string, LobbyMember>;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [tab, setTab] = useState<WeaponSlot>("kinetic");
  // Which roll's stats are shown on the right. Stale ids (e.g. after switching
  // tabs) simply fall through to the per-slot default below.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const present = SLOT_ORDER.filter((s) => rolls[s]);

  if (present.length === 0) {
    return (
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Roll Comparison</h2>
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

  const members = slot.members;
  const me = members.find((m) => m.isMe);
  const myInstances = me?.instances ?? [];
  const chosenId = chosenInstances[activeTab];
  const myChosen = myInstances.find((i) => i.instanceId === chosenId) ?? myInstances[0];
  // Which of your rolls drives your column — picked from the left rail.
  const myShown = myInstances.find((i) => i.instanceId === highlightId) ?? myChosen;

  // The instance shown per member column: you = your picked roll, others = their first.
  const shownFor = (m: MemberRolls): RollInstance | undefined =>
    m.isMe ? myShown : m.instances[0];

  const statRows = BAR_STATS.filter((s) => base[s] !== undefined || members.some((m) => shownFor(m)?.stats[s] !== undefined));
  const numRows = NUM_STATS.filter((s) => s !== "RPM" && s !== "Magazine" && (base[s] !== undefined || (myShown && myShown.stats[s] !== undefined)));

  // Reserve height for the tallest slot so switching tabs doesn't resize the panel and yank the page.
  const maxStatRows = Math.max(
    ...present.map((s) =>
      BAR_STATS.filter((st) => rolls[s]!.baseStats[st] !== undefined).length
    )
  );
  const anyNumRows = present.some((s) =>
    NUM_STATS.some(
      (st) => st !== "RPM" && st !== "Magazine" && rolls[s]!.baseStats[st] !== undefined
    )
  );

  // Selecting a roll from the left rail (only ever your own rolls live there).
  const selectRoll = (inst: RollInstance) => {
    setHighlightId(inst.instanceId);
    onChooseInstance(activeTab, inst.instanceId);
  };

  // A roll's socket icons (barrel, magazine, all perks, masterwork), each with
  // a hover tooltip describing exactly what it does. The large variant (used in
  // the comparison columns) wraps and centers; the compact variant (left rail)
  // stays on one line and groups sockets with thin separators.
  const rollPreview = (inst: RollInstance, large = true) => {
    const cls = `${large ? "w-10 h-10" : "w-9 h-9"} rounded border border-bungie-blue/40 hover:border-bungie-blue cursor-help transition`;
    const barrel = <PerkIcon icon={inst.barrelIcon} name={inst.barrelName} className={cls} />;
    const magazine = <PerkIcon icon={inst.magazineIcon} name={inst.magazineName} className={cls} />;
    const perks = inst.perkHashes.map((hash, i) => (
      <PerkIcon key={hash} icon={inst.perkIcons[hash]} name={inst.perks[i]?.name} description={inst.perks[i]?.description} className={cls} />
    ));
    const masterwork = <PerkIcon icon={inst.masterworkIcon} name={inst.masterworkName} className={cls} />;

    if (large) {
      return (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {barrel}{magazine}{perks}{masterwork}
        </div>
      );
    }

    // Compact: single row, sockets grouped (barrel/mag · perks · masterwork).
    const sep = <div className="w-px self-stretch bg-bungie-border/70 mx-0.5 my-0.5" />;
    const hasIntrinsic = Boolean(inst.barrelIcon || inst.magazineIcon);
    return (
      <div className="flex flex-nowrap items-center gap-1 min-w-0">
        {hasIntrinsic && <div className="flex gap-1">{barrel}{magazine}</div>}
        {hasIntrinsic && perks.length > 0 && sep}
        {perks.length > 0 && <div className="flex gap-1">{perks}</div>}
        {inst.masterworkIcon && sep}
        {masterwork}
      </div>
    );
  };

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-bungie-border flex items-center justify-between gap-2">
        <h2 className="text-white font-semibold text-sm">
          Roll Comparison {loading && <span className="text-gray-500 font-normal text-xs">· refreshing…</span>}
        </h2>
        {/* Slot tabs */}
        <div className="flex gap-1">
          {present.map((s) => {
            const t = damageTheme(rolls[s]!.damageType);
            const weaponName = rolls[s]!.weaponName || SLOT_LABELS[s];
            const weaponIcon = rolls[s]!.weaponIcon;
            return (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition flex items-center gap-1 ${
                  activeTab === s ? `${t.border} ${t.bg} text-white` : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                {weaponIcon && <img src={weaponIcon} alt="" className="w-6 h-6 rounded-sm" />}
                <span className="truncate max-w-[8rem]">{weaponName}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 py-3 flex gap-3">
        {/* Far-left rail: your rolls for this gun, scrollable. Click to pick
            which one drives your column; star favorites it. */}
        <div className="w-fit min-w-[13rem] max-w-[20rem] shrink-0 max-h-[22rem] overflow-y-auto pr-1 border-r border-bungie-border/50 space-y-1">
          <p className={`text-xs font-semibold px-1 mb-1 ${theme.text}`}>Your rolls</p>
          {myInstances.length === 0 ? (
            <p className="text-gray-500 text-[10px] px-1">{me?.failed ? "couldn't load" : "—"}</p>
          ) : (
            myInstances.map((inst) => {
              const isSel = inst.instanceId === myShown?.instanceId;
              const fav = favorites?.[slot.itemHash.toString()] === inst.instanceId;
              return (
                <div
                  key={inst.instanceId}
                  onClick={() => selectRoll(inst)}
                  className={`group relative flex items-center justify-between gap-2 rounded pl-2.5 pr-1.5 py-1.5 cursor-pointer select-none border transition-all duration-150 ease-out active:scale-[0.98] ${
                    isSel
                      ? `${theme.border} ${theme.bg} scale-[1.02] shadow-sm`
                      : "border-transparent hover:border-bungie-border hover:bg-bungie-border/25 hover:translate-x-0.5"
                  }`}
                >
                  {/* Accent bar that grows in on selection */}
                  <span
                    className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-full origin-center transition-all duration-200 ease-out ${theme.fill} ${
                      isSel ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50 group-hover:opacity-40 group-hover:scale-y-75"
                    }`}
                  />
                  <div className="transition-transform duration-150 group-hover:scale-[1.03]">
                    {rollPreview(inst, false)}
                  </div>
                  {onToggleFavorite && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(activeTab, slot.itemHash, inst.instanceId); }}
                      title={fav ? "Unfavorite" : "Favorite (auto-picked on roll)"}
                      className={`shrink-0 text-sm leading-none transition-transform duration-150 hover:scale-125 active:scale-90 ${fav ? "text-yellow-400" : "text-gray-500 hover:text-yellow-400"}`}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Comparison: one column per member (you first), perks on top, stats below. */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div
            className="grid gap-x-3 gap-y-1.5 items-center"
            style={{ gridTemplateColumns: `5.5rem repeat(${members.length}, minmax(14rem, 1fr))` }}
          >
            {/* Header row: each member's emblem player card (fallback to name).
                The first card also spans the stat-label column so it starts
                flush against the rolls rail, above the Impact/Range labels. */}
            {members.map((m, idx) => {
              const card = memberCards?.[m.userId];
              return (
                <div key={`h-${m.userId}`} className={`min-w-0 ${idx === 0 ? "col-span-2" : ""}`}>
                  {card ? (
                    <PlayerCard member={card} compact />
                  ) : (
                    <p className={`text-xs font-semibold truncate text-center ${m.isMe ? theme.text : "text-gray-200"}`}>
                      {m.isMe ? "You" : trimBungieName(m.displayName)}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Divider */}
            <div className="col-span-full h-px bg-bungie-border/50 my-1" />

            {/* Perks row: each member's selected roll */}
            <div className="text-gray-400 text-[10px] uppercase tracking-wide self-start pt-1">Roll</div>
            {members.map((m) => {
              const inst = shownFor(m);
              return (
                <div key={`roll-${m.userId}`} className="flex flex-wrap gap-1 justify-center">
                  {m.failed ? (
                    <span className="text-gray-500 text-[10px] italic">couldn&apos;t load</span>
                  ) : inst ? (
                    rollPreview(inst)
                  ) : (
                    <span className="text-gray-500 text-[10px]">—</span>
                  )}
                </div>
              );
            })}

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
                    if (v === undefined) return <div key={`${s}-${m.userId}`} className="text-center text-gray-500 text-[11px]">—</div>;
                    const isBest = members.length > 1 && v === max;
                    const hasBase = base[s] !== undefined;
                    const delta = hasBase ? v - base[s] : 0;
                    // Segmented bar: element fill up to the lower of base/value,
                    // then the perk difference in green (gain) or red (loss).
                    const lo = Math.min(100, Math.max(0, Math.min(v, hasBase ? base[s] : v)));
                    const hi = Math.min(100, Math.max(0, Math.max(v, hasBase ? base[s] : v)));
                    return (
                      <div key={`${s}-${m.userId}`} className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-700/80 rounded-full overflow-hidden flex">
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

            {/* Reserve height for the tallest slot so switching tabs doesn't resize the panel and yank the page. */}
            {Array.from({ length: Math.max(0, maxStatRows - statRows.length) }).map((_, i) => (
              <div key={`pad-${i}`} className="contents" aria-hidden="true">
                <div className="text-gray-400 text-[11px] invisible">—</div>
                {members.map((m) => (
                  <div key={`pad-${i}-${m.userId}`} className="text-[11px] invisible">—</div>
                ))}
              </div>
            ))}
          </div>

          {/* Intrinsic numeric stats (shared) */}
          {anyNumRows && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-2 border-t border-bungie-border/50 min-h-[1.25rem]">
              {numRows.map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="text-gray-500 text-[11px]">{s}</span>
                  <span className="text-gray-300 text-[11px] tabular-nums font-medium">{myShown?.stats[s] ?? base[s]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
