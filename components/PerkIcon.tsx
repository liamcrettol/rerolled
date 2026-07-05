"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A weapon socket icon (barrel, magazine, perk, masterwork) with a styled
// hover tooltip showing the socket's name and exact description. The tooltip is
// rendered through a portal to document.body so it escapes the RollDetails
// panel's `overflow-hidden` / `overflow-y-auto` clipping.
export default function PerkIcon({
  icon,
  name,
  description,
  communityDescription,
  stats,
  noTooltip,
  className = "w-8 h-8 border border-bungie-blue/40 hover:border-bungie-blue transition",
}: {
  icon?: string;
  name?: string;
  description?: string;
  communityDescription?: string;
  stats?: Record<string, number>;
  noTooltip?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Clamp x so a centered ~256px tooltip stays on screen.
    const x = Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140);
    // Flip below the icon when it sits too close to the top edge.
    const below = r.top < 90;
    setTip({ x, y: below ? r.bottom : r.top, below });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  if (!icon) return null;

  const statEntries = stats ? Object.entries(stats).filter(([, v]) => v !== 0) : [];
  const hasTip = !noTooltip && Boolean(name || description || communityDescription || statEntries.length > 0);

  return (
    <>
      <img
        ref={ref}
        src={icon}
        alt={name ?? ""}
        aria-label={hasTip ? name : undefined}
        onMouseEnter={hasTip ? show : undefined}
        onMouseLeave={hasTip ? hide : undefined}
        onFocus={hasTip ? show : undefined}
        onBlur={hasTip ? hide : undefined}
        tabIndex={hasTip ? 0 : undefined}
        className={className}
      />
      {tip && hasTip && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: tip.x,
              top: tip.y,
              transform: tip.below ? "translate(-50%, 8px)" : "translate(-50%, calc(-100% - 8px))",
              zIndex: 50,
              maxWidth: "16rem",
              pointerEvents: "none",
            }}
            className="border border-bungie-border bg-bungie-dark px-2.5 py-1.5 shadow-lg"
          >
            {name && <div className="text-white text-xs font-semibold">{name}</div>}
            {description && <div className="text-gray-300 text-[11px] mt-0.5 leading-snug">{description}</div>}
            {communityDescription && (
              <div className="text-gray-400 text-[11px] mt-1 pt-1 border-t border-bungie-border/50 leading-snug whitespace-pre-line">
                {communityDescription}
                <div className="text-gray-600 text-[10px] mt-1 italic">Perk data: Clarity</div>
              </div>
            )}
            {statEntries.length > 0 && (
              <div className={`flex flex-col gap-0.5 ${description ? "mt-1.5 pt-1.5 border-t border-bungie-border/50" : "mt-0.5"}`}>
                {statEntries.map(([stat, val]) => (
                  <div key={stat} className="flex items-center justify-between gap-3">
                    <span className="text-gray-400 text-[11px]">{stat}</span>
                    <span className={`text-[11px] font-semibold tabular-nums ${val > 0 ? "text-green-400" : "text-red-400"}`}>
                      {val > 0 ? `+${val}` : val}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
