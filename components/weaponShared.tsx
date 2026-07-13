"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { damageTheme } from "@/lib/destiny/constants";

export { DAMAGE_COLOR, damageTheme } from "@/lib/destiny/constants";
export type { DamageTheme } from "@/lib/destiny/constants";

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
  6: { border: "border-yellow-500/50", bg: "bg-yellow-500/10", label: "text-yellow-400", accent: "bg-yellow-500" },
  5: { border: "border-purple-500/50", bg: "bg-purple-900/10", label: "text-purple-400", accent: "bg-purple-500" },
  4: { border: "border-blue-500/40", bg: "bg-blue-900/10", label: "text-blue-400", accent: "bg-blue-500" },
};
export const DEFAULT_TIER = { border: "border-bungie-border", bg: "bg-bungie-dark", label: "text-gray-400", accent: "bg-gray-500" };

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

// ── Anchored hover tooltip ───────────────────────────────────────────────────
// Anchored to the hovered card (captured once on mouseenter) rather than
// tracking the cursor, so it sits still instead of jittering around.

interface CursorPoint { x: number; y: number }
interface TooltipState { hash: number; point: CursorPoint }

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

  // Anchor next to wherever the cursor actually is, not the hovered card's
  // position - the card can span the full width of a panel, and anchoring to
  // its edge pins the tooltip against the sidebar, covering the fireteam list.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const { point } = state;
    const pad = 12;
    const gap = 16;

    let left = point.x + gap;
    if (left + width + pad > window.innerWidth) left = point.x - width - gap;
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

    let top = point.y - height / 2;
    top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));

    setPos({ left, top });
  }, [state]);

  if (!detail) return null;

  const barStats = BAR_STATS.filter((s) => detail.stats[s] !== undefined);
  const numStats = NUM_STATS.filter((s) => detail.stats[s] !== undefined);
  const rolls = instancePerks[state.hash.toString()] ?? [];
  const isCollection = collectionHashes.has(state.hash);
  const tier = TIER_COLORS[detail.tierType] ?? DEFAULT_TIER;
  const theme = damageTheme(detail.damageType);

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-72 bg-[#0c0e11] border border-bungie-border shadow-2xl pointer-events-none overflow-hidden"
      style={{ left: pos?.left ?? state.point.x, top: pos?.top ?? state.point.y, opacity: pos ? 1 : 0 }}
    >
      {/* Rarity accent bar */}
      <div className={`h-1 w-full ${tier.accent}`} />

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-white text-sm font-semibold leading-tight">{detail.name}</p>
          {isCollection && (
            <span className="shrink-0 text-[10px] bg-amber-500/20 border border-amber-500/50 text-amber-300 px-1.5 py-0.5">
              Collection
            </span>
          )}
        </div>

        {isCollection && (
          <p className="mt-2 text-[11px] text-amber-300/90 leading-snug">
            Not owned by everyone. Pull from Collections before applying.
          </p>
        )}

        {/* Per-instance perk rolls - clean comma-separated text, not pill walls */}
        {rolls.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bungie-border/60 space-y-2">
            {rolls.map((inst, i) => (
              <div key={inst.instanceId}>
                <p className="text-gray-400 text-[10px] uppercase tracking-wide mb-0.5">
                  {rolls.length > 1 ? `Roll ${i + 1}` : "Your roll"}
                  <span className="text-gray-400 normal-case tracking-normal">
                    {" · "}{inst.location === "vault" ? "in vault" : "on character"}
                  </span>
                </p>
                <p className={`text-xs leading-snug ${theme.text}`}>{inst.perks.map((p) => String(p)).join("  ·  ")}</p>
              </div>
            ))}
          </div>
        )}

        {/* Base stats */}
        {(barStats.length > 0 || numStats.length > 0) && (
          <div className="mt-3 pt-3 border-t border-bungie-border/60 space-y-1.5">
            {barStats.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="text-gray-400 text-[11px] w-20 shrink-0">{s}</span>
                <div className="flex-1 h-1.5 bg-gray-700 overflow-hidden">
                  <div className={`h-full ${theme.fill}`} style={{ width: `${Math.min(100, detail.stats[s])}%` }} />
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
        )}
      </div>
    </div>
  );
}

// ── Hook: tracks the anchored card + renders the tooltip layer ───────────────

export function useWeaponTooltip(
  weaponDetails: Record<string, WeaponDetail>,
  instancePerks: Record<string, InstancePerk[]>,
  collectionHashes: Set<number>
) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Capture the cursor position once, on enter - no per-move updates.
  const onHover = useCallback((hash: number, e: React.MouseEvent<HTMLElement>) => {
    setTooltip({ hash, point: { x: e.clientX, y: e.clientY } });
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
