"use client";

import { useState } from "react";
import type { WeaponSlot } from "@/types/bungie";
import { BAR_STATS, NUM_STATS, damageTheme } from "./weaponShared";
import { trimBungieName } from "@/lib/utils";
import type { LobbyMember } from "@/types/lobby";
import PerkIcon from "./PerkIcon";
import PlayerCard from "./PlayerCard";
import WeaponIcon from "./WeaponIcon";
import Spinner from "./Spinner";
import { Star, Check } from "lucide-react";

interface Perk { name: string; description: string; stats?: Record<string, number>; communityDescription?: string }
interface RollInstance {
  instanceId: string;
  itemHash?: number;
  location: "character" | "vault";
  perkHashes: number[];
  perks: Perk[];
  perkIcons: Record<number, string>;
  barrelHash?: number;
  barrelName?: string;
  barrelIcon?: string;
  barrelStats?: Record<string, number>;
  magazineHash?: number;
  magazineName?: string;
  magazineIcon?: string;
  magazineStats?: Record<string, number>;
  masterworkHash?: number;
  masterworkName?: string;
  masterworkIcon?: string;
  masterworkStats?: Record<string, number>;
  catalystUnlocked?: boolean;
  isBestRoll?: boolean;
  bestRollMatched?: number;
  bestRollTotal?: number;
  baseStats?: Record<string, number>;
  stats: Record<string, number>;
  lightLevel: number;
}
interface MemberRolls {
  userId: string;
  displayName: string;
  isMe: boolean;
  instances: RollInstance[];
  failed?: boolean;
}
export interface SlotRolls {
  itemHash: number;
  damageType: string;
  tierType: number;
  baseStats: Record<string, number>;
  weaponName?: string;
  weaponIcon?: string;
  weaponWatermark?: string;
  intrinsicPerkName?: string;
  intrinsicPerkIcon?: string;
  intrinsicPerkDescription?: string;
  intrinsicPerkCommunityDescription?: string;
  catalystPerkName?: string;
  catalystPerkIcon?: string;
  catalystPerkDescription?: string;
  catalystPerkCommunityDescription?: string;
  bestRoll?: {
    barrel: string | null;
    magazine: string | null;
    perk1: string | null;
    perk2: string | null;
    priorityMasterwork: string | null;
    priorityStat1: string | null;
    priorityStat2: string | null;
    notes: string | null;
  };
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
        <p className="text-gray-500 text-xs mt-2 flex items-center gap-1.5">
          {loading && <Spinner size={12} />}
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
  const scrollMemberCards = members.length > 3;
  const me = members.find((m) => m.isMe);
  // Best-roll matches float to the top so, with several rolls of the same
  // gun, the one matching the curated archetype pick is the obvious choice
  // instead of something you have to hunt for. Stable sort - order is
  // otherwise unchanged.
  const myInstances = [...(me?.instances ?? [])].sort((a, b) => Number(b.isBestRoll) - Number(a.isBestRoll));
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
      .map((m) => { const inst = shownFor(m); return inst ? inst.stats[s] ?? inst.baseStats?.[s] ?? base[s] : undefined; })
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

  const preferredStats = [slot.bestRoll?.priorityStat1, slot.bestRoll?.priorityStat2].filter((s): s is string => Boolean(s));
  const normalizeSocketName = (name: string | null | undefined) =>
    (name ?? "")
      .toLowerCase()
      .replace(/\benhanced\b/g, "")
      .replace(/\bmasterwork\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const socketMatches = (actual: string | undefined, expected: string | null | undefined) =>
    Boolean(expected && normalizeSocketName(actual) === normalizeSocketName(expected));
  const hurtsPreferredStat = (stats: Record<string, number> | undefined) =>
    Boolean(stats && preferredStats.some((stat) => (stats[stat] ?? 0) < 0));
  const socketClass = (baseClass: string, stats: Record<string, number> | undefined, recommended: boolean) => {
    if (hurtsPreferredStat(stats)) return `${baseClass} border-red-400 hover:border-red-300 bg-red-500/10`;
    if (recommended) return `${baseClass} border-amber-300 hover:border-amber-200 bg-amber-400/10`;
    return `${baseClass} border-bungie-blue/40 hover:border-bungie-blue`;
  };
  const masterworkStatFromName = (name: string | undefined, stat: string) => {
    if (!name) return 0;
    const normalizedName = normalizeSocketName(name);
    const normalizedStat = normalizeSocketName(stat === "Reload" ? "Reload Speed" : stat);
    return normalizedName.includes(normalizedStat) ? 10 : 0;
  };
  // Calmer than "GOD ROLL" - this is a curated but unverified reference, not a
  // vetted community consensus pick (see best-rolls.json's provisional data
  // note in CLAUDE.md), so the label and tooltip both say so (#203).
  const bestRollLabel = (inst: RollInstance | undefined) =>
    inst?.bestRollTotal && inst.bestRollMatched === inst.bestRollTotal ? "REFERENCE ROLL" : "CLOSEST REFERENCE";
  const bestRollTooltip = (inst: RollInstance | undefined) =>
    bestRollLabel(inst) === "REFERENCE ROLL"
      ? "Reference roll: community best, unverified"
      : "Closest match to the reference roll: community best, unverified";

  // A roll's socket icons (barrel, magazine, all perks, masterwork), each with
  // a hover tooltip describing exactly what it does. The large variant (used in
  // the member cards) wraps and centers; the compact variant (left rail) stays
  // on one line and groups sockets with thin separators.
  const rollPreview = (inst: RollInstance, large = true) => {
    const cls = large
      ? "w-12 h-12 rounded border transition"
      : "w-8 h-8 rounded border";
    const neutralCls = socketClass(cls, undefined, false);
    const noTip = !large;
    // The weapon's fixed intrinsic frame/archetype perk (e.g. a legendary's
    // "Rapid-Fire Frame", or an exotic's unique named mechanic like Ace of
    // Spades' "Memento Mori") - same for every member since it's not a
    // swappable column perk, so it comes from `slot`, not `inst`.
    const intrinsic = (
      <PerkIcon
        icon={slot.intrinsicPerkIcon}
        name={slot.intrinsicPerkName}
        description={slot.intrinsicPerkDescription}
        communityDescription={slot.intrinsicPerkCommunityDescription}
        className={neutralCls}
        noTooltip={noTip}
      />
    );
    // The catalyst perk, only shown when THIS specific instance has it
    // unlocked (unlike the intrinsic frame, catalyst unlock is per-copy).
    const catalystShown = Boolean(slot.catalystPerkIcon && inst.catalystUnlocked);
    const catalyst = (
      <PerkIcon
        icon={slot.catalystPerkIcon}
        name={slot.catalystPerkName}
        description={slot.catalystPerkDescription}
        communityDescription={slot.catalystPerkCommunityDescription}
        className={neutralCls}
        noTooltip={noTip}
      />
    );
    // Exotics only have one real "choice" socket (their trait perk) - barrel/
    // magazine/masterwork are typically fixed or secondary on an exotic, and
    // showing them alongside intrinsic + catalyst + trait pushed the icon
    // count past what a card/row can hold in one line without wrapping badly.
    const isExotic = slot.tierType === 6;
    const barrel = isExotic ? null : (
      <PerkIcon
        icon={inst.barrelIcon}
        name={inst.barrelName}
        stats={inst.barrelStats}
        className={socketClass(cls, inst.barrelStats, socketMatches(inst.barrelName, slot.bestRoll?.barrel))}
        noTooltip={noTip}
      />
    );
    const magazine = isExotic ? null : (
      <PerkIcon
        icon={inst.magazineIcon}
        name={inst.magazineName}
        stats={inst.magazineStats}
        className={socketClass(cls, inst.magazineStats, socketMatches(inst.magazineName, slot.bestRoll?.magazine))}
        noTooltip={noTip}
      />
    );
    const perks = inst.perkHashes.map((hash, i) => (
      <PerkIcon
        key={hash}
        icon={inst.perkIcons[hash]}
        name={inst.perks[i]?.name}
        description={inst.perks[i]?.description}
        communityDescription={inst.perks[i]?.communityDescription}
        stats={inst.perks[i]?.stats}
        className={socketClass(
          cls,
          inst.perks[i]?.stats,
          socketMatches(inst.perks[i]?.name, slot.bestRoll?.perk1) || socketMatches(inst.perks[i]?.name, slot.bestRoll?.perk2)
        )}
        noTooltip={noTip}
      />
    ));
    const masterwork = isExotic ? null : (
      <PerkIcon
        icon={inst.masterworkIcon}
        name={inst.masterworkName}
        stats={inst.masterworkStats}
        className={socketClass(cls, inst.masterworkStats, socketMatches(inst.masterworkName, slot.bestRoll?.priorityMasterwork))}
        noTooltip={noTip}
      />
    );

    if (large) {
      return (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {slot.intrinsicPerkIcon && intrinsic}{catalystShown && catalyst}{barrel}{magazine}{perks}{masterwork}
        </div>
      );
    }

    // Compact: a tight grid that can wrap instead of clipping when a weapon has
    // an extra visible socket.
    const hasBarrelMag = Boolean(inst.barrelIcon || inst.magazineIcon) && !isExotic;
    return (
      <div className="grid grid-cols-5 gap-1 min-w-0">
        {slot.intrinsicPerkIcon && intrinsic}
        {catalystShown && catalyst}
        {hasBarrelMag && <>{barrel}{magazine}</>}
        {perks}
        {masterwork}
      </div>
    );
  };

  // One self-contained card per member: emblem header, their roll, then their
  // stat bars. Cards are emblem-width and lay out 3-per-row (see grid below).
  const memberCard = (m: MemberRolls) => {
    const card = memberCards?.[m.userId];
    const inst = shownFor(m);
    const isBest = Boolean(inst?.isBestRoll);
    const label = bestRollLabel(inst);
    const bestTitle = `${bestRollTooltip(inst)}${slot.bestRoll?.notes ? `. ${slot.bestRoll.notes}` : ""}`;
    return (
      <div
        key={m.userId}
        title={isBest ? bestTitle : undefined}
        className={`relative rounded-lg overflow-hidden flex flex-col ${
          isBest ? "border-2 border-amber-400 ring-1 ring-amber-400/40" : m.isMe ? `border-2 ${theme.border}` : "border border-bungie-border/60"
        } bg-bungie-dark/30`}
      >
        {isBest && (
          <div className="flex items-center justify-center gap-1 bg-amber-400 text-bungie-dark text-[11px] font-bold py-0.5">
            <Star size={11} className="fill-bungie-dark" />
            {label}
          </div>
        )}
        {/* Own-card indicator, shown regardless of whether an emblem card or the
            plain fallback header renders below, so "which one is mine" is
            never ambiguous (#203). */}
        {m.isMe && (
          <span className={`absolute top-1 left-1.5 z-10 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${theme.chip}`}>
            You
          </span>
        )}
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
          {/* Weapon icon + roll perks */}
          <div className="flex items-center justify-center gap-3">
            {slot.weaponIcon && (
              <WeaponIcon icon={slot.weaponIcon} watermark={slot.weaponWatermark} name={slot.weaponName ?? ""} size="large" />
            )}
            <div className="min-h-[3rem] flex flex-wrap gap-1.5 items-center">
              {m.failed ? (
                <span className="text-gray-500 text-xs italic">couldn&apos;t load</span>
              ) : inst ? (
                rollPreview(inst)
              ) : (
                <span className="text-gray-500 text-xs">—</span>
              )}
            </div>
          </div>

          {/* Stat rows */}
          <div className="space-y-2.5 pt-2.5 border-t border-bungie-border/40">
            {statRows.map((s) => {
              const instBase = inst?.baseStats ?? base;
              const v = inst ? inst.stats[s] ?? instBase[s] : undefined;
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
              const hasBase = instBase[s] !== undefined;
              const delta = hasBase ? v - instBase[s] : 0;
              // Segmented bar: base stat in gray, non-masterwork gains in green,
              // masterwork gain in blue, losses in red.
              const lo = Math.min(100, Math.max(0, Math.min(v, hasBase ? instBase[s] : v)));
              const hi = Math.min(100, Math.max(0, Math.max(v, hasBase ? instBase[s] : v)));
              const totalGain = Math.max(0, delta);
              const knownSocketDelta =
                (inst?.barrelStats?.[s] ?? 0) +
                (inst?.magazineStats?.[s] ?? 0) +
                (inst?.perks.reduce((sum, perk) => sum + (perk.stats?.[s] ?? 0), 0) ?? 0);
              const actualMasterworkGain = Math.max(
                0,
                inst?.masterworkStats?.[s] ?? masterworkStatFromName(inst?.masterworkName, s)
              );
              const inferredMasterworkGain = Math.max(0, delta - knownSocketDelta);
              const masterworkGain = Math.min(actualMasterworkGain || inferredMasterworkGain, totalGain, 10);
              const otherGain = Math.max(0, totalGain - masterworkGain);
              const roomAfterBase = Math.max(0, 100 - lo);
              const otherGainWidth = Math.min(roomAfterBase, otherGain);
              const masterworkGainWidth = Math.min(Math.max(0, roomAfterBase - otherGainWidth), masterworkGain);
              const lossWidth = delta < 0 ? hi - lo : 0;
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="w-[4.5rem] text-gray-400 text-xs truncate">{s}</span>
                  <div className="flex-1 h-2.5 bg-gray-700/80 rounded-full overflow-hidden flex">
                    <div className="h-full bg-gray-400" style={{ width: `${lo}%` }} />
                    {otherGainWidth > 0 && <div className="h-full bg-green-400" style={{ width: `${otherGainWidth}%` }} />}
                    {masterworkGainWidth > 0 && <div className="h-full bg-sky-400" style={{ width: `${masterworkGainWidth}%` }} />}
                    {lossWidth > 0 && <div className="h-full bg-red-500/80" style={{ width: `${lossWidth}%` }} />}
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
      <div className="px-4 py-2.5 border-b border-bungie-border">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-white font-semibold text-sm">
            Roll Comparison {loading && <span className="text-gray-500 font-normal text-xs">· refreshing…</span>}
          </h2>
        </div>
        <p className="text-gray-500 text-xs mt-0.5">
          Compare each fireteam member&apos;s owned roll for the selected weapon.
        </p>
      </div>

      <div className="px-3 py-3 flex gap-3">
        {/* Far-left column: weapon selector on top, then your rolls for the
            selected gun. Click a roll to drive your card; star favorites it. */}
        <div className="w-[15rem] shrink-0 pr-2 border-r border-bungie-border/50 flex flex-col gap-2">
          {/* Weapon selector */}
          <div className="flex flex-col gap-1">
            {present.map((s) => {
              const t = damageTheme(rolls[s]!.damageType);
              const weaponName = rolls[s]!.weaponName || SLOT_LABELS[s];
              const weaponIcon = rolls[s]!.weaponIcon;
              return (
                <button
                  key={s}
                  onClick={() => setTab(s)}
                  className={`w-full px-2 py-1.5 rounded text-xs font-semibold border transition flex items-center gap-2 ${
                    activeTab === s ? `${t.border} ${t.bg} text-white ring-1 ${t.ring}` : "border-bungie-border/60 text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  {weaponIcon && <img src={weaponIcon} alt="" className="w-7 h-7 rounded-sm shrink-0" />}
                  <span className="truncate text-left flex-1">{weaponName}</span>
                  {activeTab === s && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Your rolls (scrollable) */}
          <div className="max-h-[20rem] overflow-y-auto pr-1 pb-1 space-y-1">
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
                  title={inst.isBestRoll ? `${bestRollTooltip(inst)}${slot.bestRoll?.notes ? `. ${slot.bestRoll.notes}` : ""}` : undefined}
                  className={`group relative grid grid-cols-[1fr_1rem] items-center gap-2 rounded-md pl-2.5 pr-1.5 py-2 cursor-pointer select-none border transition-colors duration-150 ease-out active:bg-bungie-border/35 ${
                    inst.isBestRoll
                      ? `border-amber-400 bg-amber-400/10 ${isSel ? "ring-1 ring-amber-400 shadow-sm" : "hover:bg-amber-400/15"}`
                      : isSel
                        ? `${theme.border} ${theme.bg} shadow-sm`
                        : "border-transparent hover:border-bungie-border hover:bg-bungie-border/25"
                  }`}
                >
                  {/* Accent bar that grows in on selection */}
                  <span
                    className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-full origin-center transition-all duration-200 ease-out ${theme.fill} ${
                      isSel ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50 group-hover:opacity-40 group-hover:scale-y-75"
                    }`}
                  />
                  <div className="min-w-0">
                    {rollPreview(inst, false)}
                  </div>
                  {onToggleFavorite && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(activeTab, slot.itemHash, inst.instanceId); }}
                      title={fav ? "Unfavorite" : "Favorite (auto-picked on roll)"}
                      className={`h-8 w-4 justify-self-end text-sm leading-none transition-colors duration-150 ${fav ? "text-yellow-400" : "text-gray-500 hover:text-yellow-400"}`}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  )}
                </div>
              );
            })
          )}
          </div>
        </div>

        {/* Comparison: a card per member, emblem-width, 3 per row. Full height for
            one row; scrolls only once the lobby spills into another row. */}
        <div className="flex-1 min-w-0">
          <div className={`${scrollMemberCards ? "max-h-[24rem] overflow-y-auto" : ""} overflow-x-auto pr-1`}>
            <div
              className="grid gap-3 content-start min-w-full"
              style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
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
                  <span className="text-gray-300 text-[11px] tabular-nums font-medium">{myShown?.stats[s] ?? myShown?.baseStats?.[s] ?? base[s]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
