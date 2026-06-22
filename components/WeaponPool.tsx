"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import type { WeaponSlot } from "@/types/bungie";

type WeaponDetail = {
  name: string;
  icon: string;
  weaponType: string;
  damageType: string;
  tierType: number;
  tierName: string;
  ammoType: string;
  stats: Record<string, number>;
};

interface Props {
  intersection: Record<WeaponSlot, number[]>;
  weaponDetails: Record<string, WeaponDetail>;
  currentHashes: Partial<Record<WeaponSlot, number>>;
  onSelectWeapon: (slot: WeaponSlot, hash: number) => void;
  disabled?: boolean;
}

const SLOT_LABELS: Record<WeaponSlot, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

const TIER_COLORS: Record<number, { border: string; bg: string; label: string }> = {
  6: { border: "border-yellow-500", bg: "bg-yellow-500/10", label: "text-yellow-400" },
  5: { border: "border-purple-500/50", bg: "bg-purple-900/10", label: "text-purple-400" },
  4: { border: "border-blue-500/40", bg: "bg-blue-900/10", label: "text-blue-400" },
};
const DEFAULT_TIER = { border: "border-bungie-border", bg: "bg-bungie-dark", label: "text-gray-400" };

const DAMAGE_COLOR: Record<string, string> = {
  Kinetic: "text-gray-300",
  Solar: "text-orange-400",
  Arc: "text-blue-300",
  Void: "text-purple-400",
  Stasis: "text-cyan-300",
  Strand: "text-emerald-400",
};

// Stats to show as bars (0–100) in the tooltip
const BAR_STATS = ["Impact", "Range", "Stability", "Handling", "Reload", "Aim Assist", "Zoom"];
// Stats to show as raw numbers
const NUM_STATS = ["RPM", "Charge Time", "Magazine"];
// Two most important stats to surface inline on the card
const CARD_INLINE_STATS = ["RPM", "Impact", "Range", "Charge Time"];

function sortWeapons(hashes: number[], details: Record<string, WeaponDetail>): number[] {
  return [...hashes].sort((a, b) => {
    const da = details[a.toString()];
    const db = details[b.toString()];
    if (!da || !db) return 0;
    // Exotic first (tierType 6), then Legendary (5), then others
    const tierDiff = (db.tierType ?? 5) - (da.tierType ?? 5);
    if (tierDiff !== 0) return tierDiff;
    return da.name.localeCompare(db.name);
  });
}

// ── Fixed tooltip that follows the mouse cursor ─────────────────────────────

interface TooltipState {
  hash: number;
  x: number;
  y: number;
}

function FloatingTooltip({
  state,
  weaponDetails,
}: {
  state: TooltipState;
  weaponDetails: Record<string, WeaponDetail>;
}) {
  const detail = weaponDetails[state.hash.toString()];
  if (!detail) return null;

  const barStats = BAR_STATS.filter((s) => detail.stats[s] !== undefined);
  const numStats = NUM_STATS.filter((s) => detail.stats[s] !== undefined);

  // Keep tooltip on screen: if cursor is in right half, shift tooltip left
  const leftOffset = state.x > window.innerWidth / 2 ? -240 : 16;
  const topOffset = -8;

  return (
    <div
      className="fixed z-50 w-56 bg-gray-950 border border-bungie-border rounded-xl p-3 shadow-2xl pointer-events-none"
      style={{ left: state.x + leftOffset, top: state.y + topOffset }}
    >
      <p className="text-white text-sm font-semibold leading-tight mb-0.5">{detail.name}</p>
      <p className="text-gray-400 text-xs mb-1">{detail.weaponType}</p>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-medium ${TIER_COLORS[detail.tierType]?.label ?? DEFAULT_TIER.label}`}>
          {detail.tierName}
        </span>
        <span className="text-gray-600 text-xs">·</span>
        <span className={`text-xs ${DAMAGE_COLOR[detail.damageType] ?? "text-gray-300"}`}>
          {detail.damageType}
        </span>
      </div>

      {(barStats.length > 0 || numStats.length > 0) ? (
        <div className="space-y-1.5">
          {barStats.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="text-gray-400 text-xs w-20 shrink-0">{s}</span>
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-bungie-blue rounded-full"
                  style={{ width: `${Math.min(100, detail.stats[s])}%` }}
                />
              </div>
              <span className="text-gray-300 text-xs w-6 text-right tabular-nums">
                {detail.stats[s]}
              </span>
            </div>
          ))}
          {numStats.map((s) => (
            <div key={s} className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">{s}</span>
              <span className="text-gray-300 text-xs tabular-nums">{detail.stats[s]}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-xs">No stats available</p>
      )}
    </div>
  );
}

// ── Individual weapon card ────────────────────────────────────────────────────

function WeaponCard({
  hash,
  detail,
  isActive,
  onClick,
  disabled,
  onHover,
  onLeave,
}: {
  hash: number;
  detail: WeaponDetail;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  onHover: (hash: number, x: number, y: number) => void;
  onLeave: () => void;
}) {
  const tier = TIER_COLORS[detail.tierType] ?? DEFAULT_TIER;

  // Pick one interesting inline stat to show on the card
  const inlineStat = CARD_INLINE_STATS.find((s) => detail.stats[s] !== undefined);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseMove={(e) => onHover(hash, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition ${
        isActive
          ? "border-bungie-blue bg-bungie-blue/20 shadow-sm shadow-bungie-blue/20"
          : `${tier.border} ${tier.bg} hover:brightness-125`
      } disabled:opacity-40 disabled:cursor-default`}
    >
      {/* Icon */}
      <div className="relative w-11 h-11 shrink-0 rounded overflow-hidden bg-gray-800">
        {detail.icon && (
          <Image src={detail.icon} alt={detail.name} fill className="object-cover" unoptimized />
        )}
      </div>

      {/* Name + type + stat */}
      <div className="min-w-0 flex-1">
        <p className="text-white text-xs font-semibold leading-tight truncate">{detail.name}</p>
        <p className="text-gray-400 text-xs truncate">{detail.weaponType}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs ${DAMAGE_COLOR[detail.damageType] ?? "text-gray-400"}`}>
            {detail.damageType}
          </span>
          {inlineStat && (
            <span className="text-gray-500 text-xs tabular-nums">
              {inlineStat} {detail.stats[inlineStat]}
            </span>
          )}
        </div>
      </div>

      {/* Active checkmark */}
      {isActive && <span className="text-bungie-blue text-sm shrink-0">✓</span>}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WeaponPool({
  intersection,
  weaponDetails,
  currentHashes,
  onSelectWeapon,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleHover = useCallback((hash: number, x: number, y: number) => {
    setTooltip({ hash, x, y });
  }, []);
  const handleLeave = useCallback(() => setTooltip(null), []);

  // Dismiss tooltip when panel closes
  useEffect(() => {
    if (!open) setTooltip(null);
  }, [open]);

  const slots: WeaponSlot[] = ["kinetic", "energy", "power"];
  const totalWeapons =
    intersection.kinetic.length + intersection.energy.length + intersection.power.length;

  return (
    <>
      {/* Fixed cursor tooltip (rendered outside column flow so it can't clip) */}
      {tooltip && <FloatingTooltip state={tooltip} weaponDetails={weaponDetails} />}

      <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
        {/* Toggle header */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition"
        >
          <span className="text-white font-semibold text-sm">
            Weapon Browser
            <span className="ml-2 text-gray-500 font-normal text-xs">
              {totalWeapons} shared weapons — click to pin a slot
            </span>
          </span>
          <span className="text-gray-400 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
        </button>

        {open && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-4">
              {slots.map((slot) => {
                const sorted = sortWeapons(intersection[slot], weaponDetails);
                const activeHash = currentHashes[slot];
                return (
                  <div key={slot} className="min-w-0">
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-bungie-border">
                      <span className="text-sm font-bold text-white">{SLOT_LABELS[slot]}</span>
                      <span className="text-gray-500 text-xs">{sorted.length} weapons</span>
                    </div>

                    {/* Weapon list */}
                    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
                      {sorted.length === 0 ? (
                        <p className="text-gray-600 text-xs py-2">No shared weapons</p>
                      ) : (
                        sorted.map((hash) => {
                          const detail = weaponDetails[hash.toString()];
                          if (!detail) return null;
                          return (
                            <WeaponCard
                              key={hash}
                              hash={hash}
                              detail={detail}
                              isActive={activeHash === hash}
                              onClick={() => onSelectWeapon(slot, hash)}
                              disabled={disabled}
                              onHover={handleHover}
                              onLeave={handleLeave}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
