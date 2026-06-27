"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A weapon socket icon (barrel, magazine, perk, masterwork) with a styled
// hover tooltip showing the socket's name and exact description. The tooltip is
// rendered through a portal to document.body so it escapes the RollDetails
// panel's `overflow-hidden` / `overflow-y-auto` clipping. A native `title` is
// kept as a no-JS fallback.
export default function PerkIcon({
  icon,
  name,
  description,
  className = "w-8 h-8 rounded border border-bungie-blue/40 hover:border-bungie-blue cursor-help transition",
}: {
  icon?: string;
  name?: string;
  description?: string;
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

  const hasTip = Boolean(name || description);
  const title = !hasTip ? undefined : description ? `${name ?? ""} — ${description}` : name;

  return (
    <>
      <img
        ref={ref}
        src={icon}
        alt={name ?? ""}
        title={title}
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
            className="rounded border border-bungie-border bg-bungie-dark px-2.5 py-1.5 shadow-lg"
          >
            {name && <div className="text-white text-xs font-semibold">{name}</div>}
            {description && <div className="text-gray-300 text-[11px] mt-0.5 leading-snug">{description}</div>}
          </div>,
          document.body
        )}
    </>
  );
}
