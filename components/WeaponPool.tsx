"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import type { WeaponSlot } from "@/types/bungie";
import {
  type WeaponDetail,
  type InstancePerk,
  TIER_COLORS,
  DEFAULT_TIER,
  DAMAGE_COLOR,
  CARD_INLINE_STATS,
  sortWeapons,
  useWeaponTooltip,
  damageTheme,
} from "./weaponShared";

interface Props {
  intersection: Record<WeaponSlot, number[]>;
  weaponDetails: Record<string, WeaponDetail>;
  instancePerks: Record<string, InstancePerk[]>;
  collectionHashes: Set<number>;
  currentHashes: Partial<Record<WeaponSlot, number>>;
  currentInstances: Partial<Record<WeaponSlot, string>>;
  onSelectWeapon: (slot: WeaponSlot, hash: number, instanceId?: string) => void;
  favorites?: Record<string, string>;
  onToggleFavorite?: (slot: WeaponSlot, hash: number, instanceId: string) => void;
  disabled?: boolean;
}

const SLOT_LABELS: Record<WeaponSlot, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };
// Meta filter: limit the browser to the staple Crucible archetypes.
const META_BROWSER_TYPES = new Set(["Hand Cannon", "Shotgun", "Sniper Rifle"]);

// ── A single selectable roll row ──────────────────────────────────────────────

function RollRow({
  title, location, perks, selected, onClick, disabled, favorited, onToggleFavorite,
}: {
  title: string; location?: string; perks?: string[];
  selected: boolean; onClick: () => void; disabled?: boolean;
  favorited?: boolean; onToggleFavorite?: () => void;
}) {
  return (
    <div
      className={`relative w-full rounded-lg transition flex items-stretch ${
        selected ? "bg-bungie-blue/15" : "hover:bg-white/5"
      }`}
    >
      {/* left accent bar */}
      <span
        className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full ${
          selected ? "bg-bungie-blue" : "bg-transparent"
        }`}
      />
      <button onClick={onClick} disabled={disabled} className="flex-1 text-left pl-3 pr-2 py-2 disabled:opacity-40">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold ${selected ? "text-white" : "text-gray-300"}`}>
            {title}
            {location && (
              <span className="ml-1.5 text-[10px] font-normal text-gray-500">
                {location === "vault" ? "in vault" : "on character"}
              </span>
            )}
          </span>
          {selected && <span className="text-bungie-blue text-xs shrink-0">✓</span>}
        </div>
        {perks && perks.length > 0 && (
          <p className={`mt-0.5 text-[11px] leading-snug ${selected ? "text-blue-300" : "text-gray-500"}`}>
            {perks.map((p) => String(p)).join("  ·  ")}
          </p>
        )}
      </button>
      {onToggleFavorite && (
        <button
          onClick={onToggleFavorite}
          disabled={disabled}
          title={favorited ? "Unfavorite" : "Favorite this roll (auto-picked on roll)"}
          className={`px-2 shrink-0 ${favorited ? "text-yellow-400" : "text-gray-600 hover:text-yellow-400"}`}
        >
          {favorited ? "★" : "☆"}
        </button>
      )}
    </div>
  );
}

// ── Weapon card ─────────────────────────────────────────────────────────────

function WeaponCard({
  hash, detail, isActive, isCollection, rolls, currentInstance, onSelect, disabled, onHover, onLeave, favoritedInstance, onToggleFavorite,
}: {
  hash: number; detail: WeaponDetail; isActive: boolean; isCollection: boolean;
  rolls: InstancePerk[]; currentInstance?: string;
  onSelect: (hash: number, instanceId?: string) => void;
  disabled?: boolean;
  onHover: (hash: number, el: HTMLElement) => void; onLeave: () => void;
  favoritedInstance?: string;
  onToggleFavorite?: (instanceId: string) => void;
}) {
  const tier = TIER_COLORS[detail.tierType] ?? DEFAULT_TIER;
  const theme = damageTheme(detail.damageType);
  const inlineStat = CARD_INLINE_STATS.find((s) => detail.stats[s] !== undefined);
  const hasMultiple = rolls.length > 1;

  const selectedRoll = isActive && currentInstance
    ? rolls.find((r) => r.instanceId === currentInstance)
    : undefined;
  const previewRoll = selectedRoll ?? rolls.find((r) => r.location !== "vault") ?? rolls[0];
  const selectedRollIndex = selectedRoll ? rolls.indexOf(selectedRoll) : -1;

  return (
    <div
      className={`rounded-lg border overflow-hidden transition ${
        isActive ? `${theme.border} ring-1 ${theme.ring}` : tier.border
      }`}
      onMouseEnter={(e) => onHover(hash, e.currentTarget)}
      onMouseLeave={onLeave}
    >
      {/* Main card row - selects the weapon (clears any specific roll) */}
      <button
        onClick={() => onSelect(hash)}
        disabled={disabled}
        className={`w-full flex items-start gap-3 p-3 text-left transition ${
          isActive ? theme.bg : `${tier.bg} hover:brightness-125`
        } disabled:opacity-40 disabled:cursor-default`}
      >
        <div className="relative w-12 h-12 shrink-0 rounded overflow-hidden bg-gray-800">
          {detail.icon && (
            <Image src={detail.icon} alt={detail.name} fill className="object-cover" unoptimized />
          )}
          {detail.watermark && (
            <Image src={detail.watermark} alt="" fill className="object-cover pointer-events-none" unoptimized />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <p className="text-white text-xs font-semibold leading-tight">{detail.name}</p>
            <div className="flex items-center gap-1 shrink-0">
              {isCollection && (
                <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded px-1 py-0.5 leading-none">
                  C
                </span>
              )}
              {isActive && <span className="text-bungie-blue text-sm leading-none">✓</span>}
            </div>
          </div>
          <p className="text-gray-400 text-xs leading-tight truncate">{detail.weaponType}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-xs ${DAMAGE_COLOR[detail.damageType] ?? "text-gray-400"}`}>
              {detail.damageType}
            </span>
            {inlineStat && (
              <span className="text-gray-500 text-xs tabular-nums">
                {inlineStat} {detail.stats[inlineStat]}
              </span>
            )}
          </div>
          {previewRoll && (
            <p className="text-[11px] text-gray-500 leading-snug mt-1 truncate">
              {previewRoll.perks.map((p) => String(p)).join("  ·  ")}
            </p>
          )}
        </div>
      </button>

      {/* Roll picker - only for weapons with >1 roll */}
      {hasMultiple && (
        isActive ? (
          <div className="border-t border-bungie-border/50 bg-gray-900/40 px-2 py-2 space-y-0.5">
            <p className="text-gray-500 text-[10px] uppercase tracking-wide px-3 pb-0.5">
              Choose roll
              {selectedRoll
                ? ` · Roll ${selectedRollIndex + 1} selected`
                : " · using best available"}
            </p>
            <RollRow
              title="🎲 Any roll"
              perks={["best available - easiest to equip"]}
              selected={!currentInstance}
              onClick={() => onSelect(hash)}
              disabled={disabled}
            />
            {rolls.map((inst, i) => (
              <RollRow
                key={inst.instanceId}
                title={`Roll ${i + 1}`}
                location={inst.location}
                perks={inst.perks}
                selected={currentInstance === inst.instanceId}
                onClick={() => onSelect(hash, inst.instanceId)}
                disabled={disabled}
                favorited={favoritedInstance === inst.instanceId}
                onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(inst.instanceId) : undefined}
              />
            ))}
          </div>
        ) : (
          <button
            onClick={() => onSelect(hash)}
            disabled={disabled}
            className="w-full border-t border-bungie-border/50 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 hover:bg-white/5 transition flex items-center gap-1.5 disabled:opacity-40"
          >
            <span className="text-bungie-blue">◆</span>
            {rolls.length} rolls available - select to pick one
          </button>
        )
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function WeaponPool({
  intersection, weaponDetails, instancePerks, collectionHashes, currentHashes, currentInstances, onSelectWeapon, favorites, onToggleFavorite, disabled,
}: Props) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<WeaponSlot>("kinetic");
  const [typeFilter, setTypeFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState<"all" | "exotic" | "nonexotic">("all");
  const [metaOnly, setMetaOnly] = useState(false);

  const { onHover, onLeave, node: tooltipNode } = useWeaponTooltip(weaponDetails, instancePerks, collectionHashes);

  // Reset search + filters when the slot tab changes (types differ per slot)
  useEffect(() => {
    setSearch("");
    setTypeFilter("all");
    setRarityFilter("all");
    onLeave();
  }, [activeTab, onLeave]);

  const slotList: WeaponSlot[] = ["kinetic", "energy", "power"];
  const totalWeapons = slotList.reduce((n, s) => n + intersection[s].length, 0);
  const collectionCount = collectionHashes.size;
  const query = search.toLowerCase().trim();

  // Distinct weapon types present in the current slot (for the type dropdown)
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const h of intersection[activeTab]) {
      const t = weaponDetails[h.toString()]?.weaponType;
      if (t) set.add(t);
    }
    return [...set].sort();
  }, [intersection, activeTab, weaponDetails]);

  const filtersActive = query !== "" || typeFilter !== "all" || rarityFilter !== "all" || metaOnly;

  const sorted = sortWeapons(intersection[activeTab], weaponDetails);
  const filtered = sorted.filter((h) => {
    const d = weaponDetails[h.toString()];
    if (!d) return false;
    if (query && !d.name.toLowerCase().includes(query)) return false;
    if (typeFilter !== "all" && d.weaponType !== typeFilter) return false;
    if (rarityFilter === "exotic" && d.tierType !== 6) return false;
    if (rarityFilter === "nonexotic" && d.tierType === 6) return false;
    if (metaOnly && !META_BROWSER_TYPES.has(d.weaponType)) return false;
    return true;
  });
  const activeHash = currentHashes[activeTab];
  const activeInstance = currentInstances[activeTab];

  return (
    <>
      {tooltipNode}

      <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white font-semibold text-sm">Weapon Browser</span>
            <span className="text-gray-500 text-xs">
              {totalWeapons} weapons
              {collectionCount > 0 && (
                <span className="ml-1.5 text-amber-400">+{collectionCount} collections</span>
              )}
            </span>
          </div>

          {/* Slot tabs */}
          <div className="flex gap-1 mt-2">
            {slotList.map((slot) => (
              <button
                key={slot}
                onClick={() => setActiveTab(slot)}
                className={`flex-1 py-1.5 rounded-t-lg text-xs font-semibold border-b-2 transition ${
                  activeTab === slot
                    ? "border-bungie-blue text-white bg-bungie-blue/10"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                {SLOT_LABELS[slot]}
                <span className="ml-1 text-gray-500 font-normal">
                  {intersection[slot].length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search + filters */}
        <div className="px-3 py-2 border-b border-bungie-border space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${SLOT_LABELS[activeTab].toLowerCase()}…`}
            className="w-full bg-bungie-dark border border-bungie-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bungie-blue transition"
          />
          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 min-w-0 bg-bungie-dark border border-bungie-border rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-bungie-blue transition"
            >
              <option value="all">All types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as "all" | "exotic" | "nonexotic")}
              className="bg-bungie-dark border border-bungie-border rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-bungie-blue transition"
            >
              <option value="all">All rarities</option>
              <option value="exotic">Exotic</option>
              <option value="nonexotic">Non-exotic</option>
            </select>
            <button
              onClick={() => setMetaOnly((v) => !v)}
              title="Show only Hand Cannons, Shotguns, and Snipers"
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                metaOnly
                  ? "border-bungie-blue bg-bungie-blue/20 text-white"
                  : "border-bungie-border text-gray-300 hover:border-gray-400"
              }`}
            >
              Meta
            </button>
          </div>
        </div>

        {/* Weapon list */}
        <div className="px-3 pb-3 space-y-2 overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-gray-600 text-xs py-4 text-center">
              {filtersActive ? "No matches" : "No shared weapons"}
            </p>
          ) : (
            <>
              {filtersActive && filtered.length !== sorted.length && (
                <p className="text-gray-500 text-xs pt-2">{filtered.length} of {sorted.length} weapons</p>
              )}
              {filtered.map((hash) => {
                const detail = weaponDetails[hash.toString()];
                if (!detail) return null;
                const rolls = instancePerks[hash.toString()] ?? [];
                const isActive = activeHash === hash;
                return (
                  <WeaponCard
                    key={hash}
                    hash={hash}
                    detail={detail}
                    isActive={isActive}
                    isCollection={collectionHashes.has(hash)}
                    rolls={rolls}
                    currentInstance={isActive ? activeInstance : undefined}
                    onSelect={(h, instanceId) => onSelectWeapon(activeTab, h, instanceId)}
                    disabled={disabled}
                    onHover={onHover}
                    onLeave={onLeave}
                    favoritedInstance={favorites?.[hash.toString()]}
                    onToggleFavorite={onToggleFavorite ? (instanceId) => onToggleFavorite(activeTab, hash, instanceId) : undefined}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
