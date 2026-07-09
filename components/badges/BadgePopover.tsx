"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DisplayBadge } from "@/lib/badges/data";
import { compareBadgePriority, TIER_ACCENT } from "@/lib/badges/style";

// Hover/focus disclosure for a player card's badge strip.
//
// The strip only has room for 2-3 marks and the marks themselves are shared
// category glyphs, so on their own they tell you almost nothing. This lists
// every badge the player has earned with its name and description - the thing
// that actually makes a badge feel earned rather than decorative.
//
// Portals to <body> on purpose: every PlayerCard variant sets overflow-hidden
// on its root (that's what crops the emblem banner), so a panel positioned
// inside the card would be clipped by it.

const PANEL_W = 320;
const GAP = 6; // between trigger and panel
const MARGIN = 8; // min distance from the viewport edge
const CLOSE_DELAY_MS = 120; // lets the pointer cross the gap into the panel

interface Props {
  badges: DisplayBadge[];
  children: React.ReactNode;
}

export default function BadgePopover({ badges, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  // Portals need a DOM target, which doesn't exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => cancelClose(), []);

  // Measure before paint so the panel never flashes at the wrong spot. It's
  // rendered with `pos === null` for exactly one commit, hidden, so we can read
  // its real height and decide whether it fits below the trigger.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!trigger || !panel) return;

    const below = trigger.bottom + GAP;
    const fitsBelow = below + panel.height <= window.innerHeight - MARGIN;
    const top = fitsBelow ? below : trigger.top - GAP - panel.height;

    // Right-align to the trigger (it lives at the card's trailing edge), then
    // clamp so a card near the viewport edge doesn't push the panel offscreen.
    const right = trigger.right - PANEL_W;
    const left = Math.min(Math.max(right, MARGIN), window.innerWidth - PANEL_W - MARGIN);

    setPos({ top: Math.max(top, MARGIN), left });
  }, [open]);

  // A fixed-position panel detaches from its trigger the moment the page moves.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (badges.length === 0) return null;

  const ordered = [...badges].sort(compareBadgePriority);

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="tooltip"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: PANEL_W,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-50 border border-bungie-border bg-bungie-dark shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
    >
      <p className="section-label border-b border-bungie-border px-3 py-2">
        {ordered.length} {ordered.length === 1 ? "Badge" : "Badges"}
      </p>
      <ul className="max-h-80 overflow-y-auto">
        {ordered.map((b) => (
          <li
            key={b.slug + b.earnedAt}
            className="flex gap-2.5 border-b border-bungie-border/40 px-3 py-2 last:border-b-0"
          >
            <span
              className="shrink-0 self-start border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: TIER_ACCENT[b.tier], borderColor: TIER_ACCENT[b.tier] }}
            >
              {b.name}
            </span>
            <span className="min-w-0 flex-1 text-[11px] leading-snug text-gray-300">
              {b.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        tabIndex={0}
        aria-describedby={open ? panelId : undefined}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        onBlur={scheduleClose}
        // Touch has no hover; tapping the strip toggles the panel.
        onClick={() => setOpen((v) => !v)}
        className="relative z-10 flex shrink-0 cursor-default items-center self-center outline-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] focus-visible:ring-1 focus-visible:ring-bungie-blue"
      >
        {children}
      </div>
      {mounted && open && createPortal(panel, document.body)}
    </>
  );
}
