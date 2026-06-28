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
  // Which of your rolls drives your card — picked from the left rail.
  const myShown = myInstances.find((i) => i.instanceId === highlightId) ?? myChosen;

  // The instance shown per member card: you = your picked roll, others = their first.
  const shownFor = (m: MemberRolls): RollInstance | undefined =>
    m.isMe ? myShown : m.instances[0];

  const statRows = BAR_STATS.filter((s) => base[s] !== undefined || members.some((m) => shownFor(m)?.stats[s] !== undefined));
  const numRows = NUM_STATS.filter((s) => s !== "RPM" && s !== "Magazine" && (base[s] !== undefined || (myShown && myShown.stats[s] !== undefined)));

  // Team-best per stat, so the highest value across members can be highlighted
  // in each card.
  const bestPerStat: Record<string, number> = {};
  for (const s of statRows) {
    const vals = members
      .map((m) => { const inst = shownFor(m); return inst ? inst.stats[s] ?? base[s] : undefined; })
      .filter((v): v is number => v !== undefined);
    if (vals.length) bestPerStat[s] = Math.max(...vals);
  }

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
  // the member cards) wraps and centers; the compact variant (left rail) stays
  // on one line and groups sockets with thin separators.
  const rollPreview = (inst: RollInstance, large = true) => {
    const cls = `${large ? "w-12 h-12" : "w-9 h-9"} rounded border border-bungie-blue/40 hover:border-bungie-blue cursor-help transition`;
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

  // One self-contained card per member: emblem header, their roll, then their
  // stat bars. Cards are emblem-width and lay out 3-per-row (see grid below).
  const memberCard = (m: MemberRolls) => {
    const card = memberCards?.[m.userId];
    const inst = shownFor(m);
    return (
      <div key={m.userId} className="rounded-lg border border-bungie-border/60 bg-bungie-dark/30 overflow-hidden flex flex-col">
        {/* Emblem header (fallback to name) */}
        {card ? (
          <PlayerCard member={card} />
        ) : (
          <div className="h-20 flex items-center justify-center bg-bungie-dark border-b border-bungie-border/60 px-3">
            <span className={`text-lg font-bold truncate ${m.isMe ? theme.text : "text-gray-200"}`}>
              {m.isMe ? "You" : trimBungieName(m.displayName)}
            </span>
          </div>
        )}

        <div className="p-3 space-y-3 flex-1 flex flex-col">
          {/* Roll perks */}
          <div className="min-h-[3.25rem] flex flex-wrap gap-1.5 justify-center items-center">
            {m.failed ? (
              <span className="text-gray-500 text-xs italic">couldn&apos;t load</span>
            ) : inst ? (
              rollPreview(inst)
            ) : (
              <span className="text-gray-500 text-xs">—</span>
            )}
          </div>

          {/* Stat rows */}
          <div className="space-y-2.5 pt-2.5 border-t border-bungie-border/40">
            {statRows.map((s) => {
              const v = inst ? inst.stats[s] ?? base[s] : undefined;
              if (v === undefined) {
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-[4.5rem] text-gray-400 text-xs truncate">{s}</span>
                    <div className="flex-1 h-2.5 bg-gray-700/40 rounded-full" />
                    <span className="w-7 text-right text-gray-500 text-sm">—</span>
                    <span className="w-7" />
                  </div>
                );
              }
              const isBest = members.length > 1 && v === bestPerStat[s];
              const hasBase = base[s] !== undefined;
              const delta = hasBase ? v - base[s] : 0;
              // Segmented bar: element fill up to the lower of base/value, then
              // the perk difference in green (gain) or red (loss).
              const lo = Math.min(100, Math.max(0, Math.min(v, hasBase ? base[s] : v)));
              const hi = Math.min(100, Math.max(0, Math.max(v, hasBase ? base[s] : v)));
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="w-[4.5rem] text-gray-400 text-xs truncate">{s}</span>
                  <div className="flex-1 h-2.5 bg-gray-700/80 rounded-full overflow-hidden flex">
                    <div className="h-full bg-gray-400" style={{ width: `${lo}%` }} />
                    {hi > lo && (
                      <div className={`h-full ${delta >= 0 ? "bg-green-400" : "bg-red-500/80"}`} style={{ width: `${hi - lo}%` }} />
                    )}
                  </div>
                  <span className={`w-7 text-right tabular-nums text-sm ${isBest ? `${theme.text} font-semibold` : "text-gray-300"}`}>{v}</span>
                  {/* Always reserve the delta column so every bar lines up */}
                  <span className={`w-7 text-right text-[11px] tabular-nums ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-transparent"}`}>
                    {m.isMe && delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : ""}
                  </span>
                </div>
              );
            })}

            {/* Reserve height for the tallest slot so switching tabs doesn't resize the panel. */}
            {Array.from({ length: Math.max(0, maxStatRows - statRows.length) }).map((_, i) => (
              <div key={`pad-${i}`} className="flex items-center gap-2" aria-hidden="true">
                <span className="w-[4.5rem] text-xs invisible">—</span>
                <div className="flex-1 h-2.5" />
                <span className="w-7 text-sm invisible">—</span>
                <span className="w-7" />
              </div>
            ))}
          </div>
        </div>
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
            which one drives your card; star favorites it. */}
        <div className="w-fit min-w-[13rem] max-w-[20rem] shrink-0 max-h-[24rem] overflow-y-auto pr-1 border-r border-bungie-border/50 space-y-1">
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

        {/* Comparison: a card per member, emblem-width, 3 per row. Members
            beyond the first row scroll inside this fixed-height compartment. */}
        <div className="flex-1 min-w-0">
          <div className="max-h-[24rem] overflow-y-auto overflow-x-auto pr-1">
            <div
              className="grid gap-3 content-start justify-start"
              style={{ gridTemplateColumns: "repeat(3, 22rem)" }}
            >
              {members.map((m) => memberCard(m))}
            </div>
          </div>

          {/* Intrinsic numeric stats (shared across the fireteam) */}
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
