"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { Shuffle, Check, Star, Repeat } from "lucide-react";
import Card from "./ui/Card";
import type { WeaponSlot } from "@/types/bungie";
import {
  type WeaponDetail,
  type InstancePerk,
  TIER_COLORS,
  DEFAULT_TIER,
  DAMAGE_COLOR,
  CARD_INLINE_STATS,
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
  // Sibling item hashes (other releases/Adept versions of the same gun) I own,
  // keyed by the representative hash shown in the pool - lets the currently
  // equipped card offer swapping to a different release (#47).
  weaponReleases?: Record<string, number[]>;
  favorites?: Record<string, string>;
  onToggleFavorite?: (slot: WeaponSlot, hash: number, instanceId: string) => void;
  disabled?: boolean;
  // View-only mode for non-captains: the pool is browsable (search, filter,
  // hover for perks/stats) but weapons can't be selected into the loadout.
  readOnly?: boolean;
  // Fill the parent's height (xl+) instead of capping at a fixed max-height —
  // used when the pool occupies a full-height column.
  fillHeight?: boolean;
  // Let the outer container handle scrolling — removes internal max-h cap and
  // overflow-y so the pool renders at natural height inside a scrollable parent.
  noScroll?: boolean;
  weaponSeals?: Record<number, {
    isInLoadout: boolean;
    isInYourRoll: boolean;
    isInFireteamRoll: boolean;
  }>;
  // Meta lobbies already operate inside the meta archetype set, so the
  // redundant "Meta only" filter is hidden there (#284). Defaults to shown.
  showMetaFilter?: boolean;
}

const SLOT_LABELS: Record<WeaponSlot, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };
// Meta filter: limit the browser to the staple Crucible archetypes.
const META_BROWSER_TYPES = new Set(["Hand Cannon", "Shotgun", "Sniper Rifle"]);

function stableBrowserRank(hash: number, slot: WeaponSlot): number {
  const slotSeed = slot === "kinetic" ? 0x9e3779b1 : slot === "energy" ? 0x85ebca6b : 0xc2b2ae35;
  let x = (hash ^ slotSeed) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function sortForBrowser(
  hashes: number[],
  details: Record<string, WeaponDetail>,
  favorites: Record<string, string> | undefined,
  slot: WeaponSlot
): number[] {
  return [...hashes].sort((a, b) => {
    const aFavorite = Boolean(favorites?.[a.toString()]);
    const bFavorite = Boolean(favorites?.[b.toString()]);
    if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;

    const rankDiff = stableBrowserRank(a, slot) - stableBrowserRank(b, slot);
    if (rankDiff !== 0) return rankDiff;

    const da = details[a.toString()];
    const db = details[b.toString()];
    return (da?.name ?? "").localeCompare(db?.name ?? "");
  });
}

// ── A single selectable roll row ──────────────────────────────────────────────

export function RollRow({
  label, icon, location, perks, selected, onClick, disabled, favorited, onToggleFavorite,
}: {
  label: string; icon?: React.ReactNode; location?: string; perks?: string[];
  selected: boolean; onClick: () => void; disabled?: boolean;
  favorited?: boolean; onToggleFavorite?: () => void;
}) {
  return (
    <div
      className={`relative w-full transition flex items-stretch ${
        selected ? "bg-bungie-blue/15" : "hover:bg-white/5"
      }`}
    >
      {/* left accent bar */}
      <span
        className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] transition-colors duration-200 ${
          selected ? "bg-bungie-blue" : "bg-transparent"
        }`}
      />
      <button onClick={onClick} disabled={disabled} className="flex-1 text-left pl-3 pr-2 py-2 disabled:opacity-40">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold inline-flex items-center gap-1 ${selected ? "text-white" : "text-gray-300"}`}>
            {icon}
            {label}
            {location && (
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">
                {location === "vault" ? "in vault" : "on character"}
              </span>
            )}
          </span>
          {selected && <Check size={13} className="text-bungie-blue shrink-0 animate-fade-in" />}
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
          aria-label={favorited ? "Unfavorite" : "Favorite this roll"}
          className={`px-2 shrink-0 flex items-center ${favorited ? "text-yellow-400" : "text-gray-400 hover:text-yellow-400"}`}
        >
          <Star size={14} fill={favorited ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

// ── Weapon card ─────────────────────────────────────────────────────────────

function WeaponCard({
  hash, detail, isActive, isCollection, rolls, currentInstance, onSelect, disabled, readOnly, onHover, onLeave, favoritedInstance, onToggleFavorite, seals, releases,
}: {
  hash: number; detail: WeaponDetail; isActive: boolean; isCollection: boolean;
  rolls: InstancePerk[]; currentInstance?: string;
  onSelect: (hash: number, instanceId?: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  onHover: (hash: number, e: React.MouseEvent<HTMLElement>) => void; onLeave: () => void;
  favoritedInstance?: string;
  onToggleFavorite?: (instanceId: string) => void;
  seals?: {
    isInLoadout: boolean;
    isInYourRoll: boolean;
    isInFireteamRoll: boolean;
  };
  // Other releases of this weapon I own, only offered while this card is the
  // one currently equipped in its slot.
  releases?: Array<{ hash: number; detail: WeaponDetail }>;
}) {
  const tier = TIER_COLORS[detail.tierType] ?? DEFAULT_TIER;
  const theme = damageTheme(detail.damageType);
  const inlineStat = CARD_INLINE_STATS.find((s) => detail.stats[s] !== undefined);
  const hasMultiple = rolls.length > 1;

  // Fire a one-shot ring pulse when this card becomes the selected weapon -
  // the same land pulse the loadout reel uses, so picking feels connected.
  const [justPicked, setJustPicked] = useState(false);
  const prevActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevActive.current) {
      setJustPicked(true);
      const t = setTimeout(() => setJustPicked(false), 650);
      prevActive.current = isActive;
      return () => clearTimeout(t);
    }
    prevActive.current = isActive;
  }, [isActive]);

  const selectedRoll = isActive && currentInstance
    ? rolls.find((r) => r.instanceId === currentInstance)
    : undefined;
  const previewRoll = selectedRoll ?? rolls.find((r) => r.location !== "vault") ?? rolls[0];

  const cardInner = (
    <>
      <div
        className="relative w-12 h-12 shrink-0 overflow-hidden bg-gray-800 cursor-help"
        onMouseEnter={(e) => onHover(hash, e)}
        onMouseLeave={onLeave}
      >
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
              <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-400 px-1 py-0.5 leading-none">
                C
              </span>
            )}
            {isActive && <Check size={15} className="text-bungie-blue animate-fade-in" />}
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
    </>
  );

  return (
    <div
      className={`border overflow-hidden transition ${
        isActive ? `${theme.border} ring-1 ${theme.ring}` : tier.border
      } ${justPicked ? "animate-slot-land" : ""} ${
        ""
      }`}
    >
      {/* Main card row. Read-only viewers get a static row (still hoverable for
          the perk/stat tooltip); captains get a button that selects the weapon. */}
      {readOnly ? (
        <div className={`w-full flex items-start gap-3 p-3 ${isActive ? theme.bg : tier.bg}`}>
          {cardInner}
        </div>
      ) : (
        <button
          onClick={() => onSelect(hash)}
          disabled={disabled}
          className={`w-full flex items-start gap-3 p-3 text-left transition ${
            isActive ? theme.bg : `${tier.bg} hover:brightness-125`
          } disabled:opacity-40 disabled:cursor-default`}
        >
          {cardInner}
        </button>
      )}

      {/* Roll picker - only for weapons with >1 roll, and only when interactive */}
      {!readOnly && hasMultiple && (
        isActive ? (
          <div className="border-t border-bungie-border/50 bg-gray-900/40 px-2 py-2 space-y-0.5">
            <p className="text-gray-400 text-[10px] uppercase tracking-wide px-3 pb-0.5">
              {selectedRoll ? "Choose roll" : "Choose roll · using best available"}
            </p>
            <RollRow
              label="Any roll"
              icon={<Shuffle size={12} className="shrink-0 text-gray-400" />}
              perks={["best available"]}
              selected={!currentInstance}
              onClick={() => onSelect(hash)}
              disabled={disabled}
            />
            {rolls.map((inst) => (
              <RollRow
                key={inst.instanceId}
                label={inst.perks.map((p) => String(p)).join("  ·  ")}
                location={inst.location}
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
            <Star size={11} className="text-bungie-blue" />
            {rolls.length} rolls, select to choose
          </button>
        )
      )}

      {/* Release picker - other reissues/Adept versions of this gun I own,
          only offered on the card currently equipped in this slot. */}
      {!readOnly && isActive && releases && releases.length > 0 && (
        <div className="border-t border-bungie-border/50 bg-gray-900/40 px-2 py-2 space-y-0.5">
          <p className="text-gray-400 text-[10px] uppercase tracking-wide px-3 pb-0.5">
            Other releases
          </p>
          {releases.map(({ hash: relHash, detail: relDetail }) => (
            <RollRow
              key={relHash}
              label={relDetail.name}
              icon={<Repeat size={12} className="shrink-0 text-gray-400" />}
              perks={[relDetail.tierName]}
              selected={false}
              onClick={() => onSelect(relHash)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function WeaponPool({
  intersection, weaponDetails, instancePerks, collectionHashes, currentHashes, currentInstances, onSelectWeapon, favorites, onToggleFavorite, disabled, readOnly, weaponSeals, fillHeight, noScroll, weaponReleases, showMetaFilter = true,
}: Props) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<WeaponSlot>("kinetic");
  const [typeFilter, setTypeFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState<"all" | "exotic" | "nonexotic">("all");
  const [metaOnly, setMetaOnly] = useState(false);
  const [hideCollections, setHideCollections] = useState(false);

  const { onHover, onLeave, node: tooltipNode } = useWeaponTooltip(weaponDetails, instancePerks, collectionHashes);
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setRarityFilter("all");
    setMetaOnly(false);
    setHideCollections(false);
  };

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

  const filtersActive = query !== "" || typeFilter !== "all" || rarityFilter !== "all" || metaOnly || hideCollections;

  const sorted = useMemo(
    () => sortForBrowser(intersection[activeTab], weaponDetails, favorites, activeTab),
    [intersection, activeTab, weaponDetails, favorites]
  );
  const filtered = sorted.filter((h) => {
    const d = weaponDetails[h.toString()];
    if (!d) return false;
    if (query && !d.name.toLowerCase().includes(query)) return false;
    if (typeFilter !== "all" && d.weaponType !== typeFilter) return false;
    if (rarityFilter === "exotic" && d.tierType !== 6) return false;
    if (rarityFilter === "nonexotic" && d.tierType === 6) return false;
    if (metaOnly && !META_BROWSER_TYPES.has(d.weaponType)) return false;
    if (hideCollections && collectionHashes.has(h)) return false;
    return true;
  });
  const visibleCollectionCount = sorted.filter((h) => collectionHashes.has(h)).length;
  const activeHash = currentHashes[activeTab];
  const activeInstance = currentInstances[activeTab];

  return (
    <>
      {tooltipNode}

      <Card className={`overflow-hidden flex flex-col ${noScroll ? "" : fillHeight ? "max-h-[30rem] xl:max-h-none xl:h-full" : "max-h-[30rem]"}`}>
        {/* Header */}
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-1">
            <span className="section-label">Weapon Browser</span>
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
                className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition ${
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
            className="w-full bg-bungie-dark border border-bungie-border px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bungie-blue transition"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 min-w-[7rem] bg-bungie-dark border border-bungie-border px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-bungie-blue transition"
            >
              <option value="all">All types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as "all" | "exotic" | "nonexotic")}
              className="bg-bungie-dark border border-bungie-border px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-bungie-blue transition"
            >
              <option value="all">All rarities</option>
              <option value="exotic">Exotic</option>
              <option value="nonexotic">Non-exotic</option>
            </select>
            {showMetaFilter && (
              <button
                onClick={() => setMetaOnly((v) => !v)}
                aria-label="Filter to only Hand Cannons, Shotguns, and Sniper Rifles"
                className={`shrink-0 px-2.5 py-1.5 text-xs font-medium border transition ${
                  metaOnly
                    ? "border-bungie-blue bg-bungie-blue/20 text-white"
                    : "border-bungie-border text-gray-300 hover:border-gray-400"
                }`}
              >
                Meta only
              </button>
            )}
            <button
              onClick={() => setHideCollections((v) => !v)}
              aria-pressed={hideCollections}
              disabled={visibleCollectionCount === 0}
              className={`shrink-0 px-2.5 py-1.5 text-xs font-medium border transition ${
                hideCollections
                  ? "border-amber-400 bg-amber-500/15 text-amber-200"
                  : visibleCollectionCount === 0
                    ? "border-bungie-border/50 text-gray-600 cursor-not-allowed"
                    : "border-bungie-border text-gray-300 hover:border-gray-400"
              }`}
            >
              Hide Collections
            </button>
          </div>
        </div>

        {/* Weapon list */}
        <div className={`px-3 pb-3 space-y-2 flex-1 ${noScroll ? "" : "overflow-y-auto"}`}>
          {filtered.length === 0 ? (
            <div className="border border-bungie-border/60 bg-bungie-dark/60 px-3 py-4 mt-3 text-center">
              <p className="text-sm font-semibold text-gray-300">
                {filtersActive ? "No weapons match these filters" : "No shared weapons in this slot"}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                {filtersActive
                  ? hideCollections && sorted.length > 0 && sorted.every((h) => collectionHashes.has(h))
                    ? "This slot is only showing collection pulls right now."
                    : "Search, type, rarity, meta, or collection filters may be narrowing the list."
                  : "Try another slot or reload the shared pool once everyone is ready."}
              </p>
              {filtersActive && (
                <button
                  onClick={clearFilters}
                  className="mt-3 border border-bungie-border px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-gray-400 hover:text-white"
                >
                  Clear Filters
                </button>
              )}
            </div>
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
                const releases = (weaponReleases?.[hash.toString()] ?? [])
                  .map((relHash) => ({ hash: relHash, detail: weaponDetails[relHash.toString()] }))
                  .filter((r): r is { hash: number; detail: WeaponDetail } => !!r.detail);
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
                    readOnly={readOnly}
                    onHover={onHover}
                    onLeave={onLeave}
                    favoritedInstance={favorites?.[hash.toString()]}
                    onToggleFavorite={onToggleFavorite ? (instanceId) => onToggleFavorite(activeTab, hash, instanceId) : undefined}
                    seals={weaponSeals?.[hash] ?? { isInLoadout: false, isInYourRoll: false, isInFireteamRoll: false }}
                    releases={releases}
                  />
                );
              })}
            </>
          )}
        </div>
      </Card>
    </>
  );
}
