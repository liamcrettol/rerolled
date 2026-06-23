"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

// ── Shared types ────────────────────────────────────────────────────────────

export type WeaponDetail = {
  name: string;
  icon: string;
  watermark?: string;
  weaponType: string;
  damageType: string;
  tierType: number;
  tierName: string;
  ammoType: string;
  stats: Record<string, number>;
};

export type InstancePerk = {
  instanceId: string;
  perks: string[];
  location: string;
  characterId?: string;
};

// ── Shared style maps ─────────────────────────────────────────────────────────

export const TIER_COLORS: Record<number, { border: string; bg: string; label: string; accent: string }> = {
  6: { border: "border-yellow-500", bg: "bg-yellow-500/10", label: "text-yellow-400", accent: "bg-yellow-500" },
  5: { border: "border-purple-500/50", bg: "bg-purple-900/10", label: "text-purple-400", accent: "bg-purple-500" },
  4: { border: "border-blue-500/40", bg: "bg-blue-900/10", label: "text-blue-400", accent: "bg-blue-500" },
};
export const DEFAULT_TIER = { border: "border-bungie-border", bg: "bg-bungie-dark", label: "text-gray-400", accent: "bg-gray-500" };

export const DAMAGE_COLOR: Record<string, string> = {
  Kinetic: "text-gray-300",
  Solar: "text-orange-400",
  Arc: "text-blue-300",
  Void: "text-purple-400",
  Stasis: "text-cyan-300",
  Strand: "text-emerald-400",
};

export const BAR_STATS = ["Impact", "Range", "Stability", "Handling", "Reload", "Aim Assist", "Zoom"];
export const NUM_STATS = ["RPM", "Charge Time", "Magazine"];
export const CARD_INLINE_STATS = ["RPM", "Impact", "Range", "Charge Time"];

export function sortWeapons(hashes: number[], details: Record<string, WeaponDetail>): number[] {
  return [...hashes].sort((a, b) => {
    const da = details[a.toString()];
    const db = details[b.toString()];
    if (!da || !db) return 0;
    const tierDiff = (db.tierType ?? 5) - (da.tierType ?? 5);
    if (tierDiff !== 0) return tierDiff;
    return da.name.localeCompare(db.name);
  });
}

// ── Floating cursor tooltip ─────────────────────────────────────────────────

export interface TooltipState { hash: number; x: number; y: number }

function FloatingTooltip({
  state,
  weaponDetails,
  instancePerks,
  collectionHashes,
}: {
  state: TooltipState;
  weaponDetails: Record<string, WeaponDetail>;
  instancePerks: Record<string, InstancePerk[]>;
  collectionHashes: Set<number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const detail = weaponDetails[state.hash.toString()];

  // Measure the rendered tooltip and place it next to the cursor, flipping
  // and clamping so it never spills off any edge of the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 12;
    const gap = 16;

    let left = state.x + gap;
    if (left + width + pad > window.innerWidth) left = state.x - width - gap;
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

    let top = state.y + gap;
    if (top + height + pad > window.innerHeight) top = state.y - height - gap;
    top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));

    setPos({ left, top });
  }, [state.x, state.y, state.hash]);

  if (!detail) return null;

  const barStats = BAR_STATS.filter((s) => detail.stats[s] !== undefined);
  const numStats = NUM_STATS.filter((s) => detail.stats[s] !== undefined);
  const rolls = instancePerks[state.hash.toString()] ?? [];
  const isCollection = collectionHashes.has(state.hash);
  const tier = TIER_COLORS[detail.tierType] ?? DEFAULT_TIER;

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-72 bg-gray-950/95 backdrop-blur border border-bungie-border rounded-xl shadow-2xl pointer-events-none overflow-hidden"
      style={{ left: pos?.left ?? state.x + 16, top: pos?.top ?? state.y + 16, opacity: pos ? 1 : 0 }}
    >
      {/* Rarity accent bar */}
      <div className={`h-1 w-full ${tier.accent}`} />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-white text-sm font-semibold leading-tight">{detail.name}</p>
          {isCollection && (
            <span className="shrink-0 text-[10px] bg-amber-500/20 border border-amber-500/50 text-amber-300 rounded px-1.5 py-0.5">
              Collection
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-1 mb-3 text-xs flex-wrap">
          <span className={`font-medium ${tier.label}`}>{detail.tierName}</span>
          <span className="text-gray-600">·</span>
          <span className={DAMAGE_COLOR[detail.damageType] ?? "text-gray-300"}>{detail.damageType}</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400">{detail.weaponType}</span>
          {detail.ammoType && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">{detail.ammoType}</span>
            </>
          )}
        </div>

        {/* Per-instance perk rolls */}
        {rolls.length > 0 && (
          <div className="mb-3">
            <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1.5">
              Your {rolls.length > 1 ? `${rolls.length} rolls` : "roll"}
            </p>
            <div className="space-y-1.5">
              {rolls.map((inst, i) => (
                <div key={inst.instanceId} className="bg-gray-800/60 rounded-lg px-2 py-1.5">
                  <p className="text-gray-500 text-[10px] mb-1">
                    {rolls.length > 1 ? `Roll ${i + 1} · ` : ""}
                    {inst.location === "vault" ? "In vault" : "On character"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {inst.perks.map((perk) => (
                      <span
                        key={perk}
                        className="text-[10px] bg-bungie-blue/20 border border-bungie-blue/40 text-blue-300 rounded px-1.5 py-0.5"
                      >
                        {perk}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Base stats — bars on the left, flat numbers on the right */}
        {barStats.length > 0 || numStats.length > 0 ? (
          <div className="space-y-1.5">
            {barStats.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="text-gray-400 text-[11px] w-20 shrink-0">{s}</span>
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-bungie-blue rounded-full" style={{ width: `${Math.min(100, detail.stats[s])}%` }} />
                </div>
                <span className="text-gray-300 text-[11px] w-6 text-right tabular-nums">{detail.stats[s]}</span>
              </div>
            ))}
            {numStats.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                {numStats.map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-[11px]">{s}</span>
                    <span className="text-gray-200 text-[11px] tabular-nums font-medium">{detail.stats[s]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-600 text-xs">No stats available</p>
        )}
      </div>
    </div>
  );
}

// ── Hook: wires cursor tracking + renders the tooltip layer ──────────────────

export function useWeaponTooltip(
  weaponDetails: Record<string, WeaponDetail>,
  instancePerks: Record<string, InstancePerk[]>,
  collectionHashes: Set<number>
) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const onHover = useCallback((hash: number, x: number, y: number) => {
    setTooltip({ hash, x, y });
  }, []);
  const onLeave = useCallback(() => setTooltip(null), []);

  const node = tooltip ? (
    <FloatingTooltip
      state={tooltip}
      weaponDetails={weaponDetails}
      instancePerks={instancePerks}
      collectionHashes={collectionHashes}
    />
  ) : null;

  return { onHover, onLeave, node };
}
