"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, Zap, Sparkles, Snowflake, Waves } from "lucide-react";
import { DAMAGE_THEME } from "./weaponShared";

// Purely decorative "loadout roll" for the signed-out landing hero - there's
// no session yet to pull real weapons for, so each slot spins through
// Destiny's real damage-type colors/icons (same DAMAGE_THEME used
// throughout the app) using the exact scroll-and-land reel mechanic from
// WeaponSlotContent in LoadoutQueue.tsx, just keyed off a random interval
// instead of a real roll.
const CYCLE = [
  { type: "Solar", Icon: Flame },
  { type: "Arc", Icon: Zap },
  { type: "Void", Icon: Sparkles },
  { type: "Stasis", Icon: Snowflake },
  { type: "Strand", Icon: Waves },
] as const;

const REEL_ITEM_H = 56;
const REEL_PRE_COUNT = 10;

const SLOTS: Array<{ label: string; intervalMs: number; staggerMs: number }> = [
  { label: "Kinetic", intervalMs: 2800, staggerMs: 0 },
  { label: "Energy", intervalMs: 2800, staggerMs: 160 },
  { label: "Power", intervalMs: 2800, staggerMs: 320 },
];

function randomCycleIndex(exclude?: number): number {
  let i = Math.floor(Math.random() * CYCLE.length);
  if (exclude !== undefined && CYCLE.length > 1) {
    while (i === exclude) i = Math.floor(Math.random() * CYCLE.length);
  }
  return i;
}

function ReelSlot({ intervalMs, staggerMs }: { intervalMs: number; staggerMs: number }) {
  const [targetIndex, setTargetIndex] = useState(() => randomCycleIndex());
  const [reelItems, setReelItems] = useState<number[]>([targetIndex]);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Advance to a new random target on an interval.
  useEffect(() => {
    const id = setInterval(() => {
      setTargetIndex((i) => randomCycleIndex(i));
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  // Build the pre-roll reel once the target changes, after this slot's stagger delay.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const staggerTimer = setTimeout(() => {
      const randoms = Array.from({ length: REEL_PRE_COUNT }, () => randomCycleIndex());
      setReelItems([...randoms, targetIndex]);
      setSpinning(true);
      setLanded(false);
    }, staggerMs);
    return () => clearTimeout(staggerTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIndex]);

  // Kick off the CSS scroll once reelItems + spinning are set.
  useEffect(() => {
    if (!spinning || reelItems.length < 2) return;
    const reel = reelRef.current;
    if (!reel) return;

    const targetY = -((reelItems.length - 1) * REEL_ITEM_H);
    reel.style.transition = "none";
    reel.style.transform = "translateY(0)";

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reel.style.transition = "transform 900ms cubic-bezier(0.1, 0.6, 0.3, 1)";
        reel.style.transform = `translateY(${targetY}px)`;
      });
    });

    const landTimer = setTimeout(() => {
      setSpinning(false);
      setReelItems([targetIndex]);
      const r = reelRef.current;
      if (r) { r.style.transition = "none"; r.style.transform = "translateY(0)"; }
      setLanded(true);
      setTimeout(() => setLanded(false), 600);
    }, 950);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(landTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, reelItems]);

  const theme = DAMAGE_THEME[CYCLE[targetIndex].type];

  return (
    <div
      className={`relative rounded-xl border overflow-hidden shrink-0 transition-shadow duration-300 ${theme.border} ${
        landed ? "animate-slot-land" : ""
      }`}
      style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
    >
      <div ref={reelRef} style={{ willChange: "transform" }}>
        {reelItems.map((ci, i) => {
          const cell = DAMAGE_THEME[CYCLE[ci].type];
          const Icon = CYCLE[ci].Icon;
          return (
            <div
              key={i}
              style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
              className={`flex items-center justify-center ${cell.bg}`}
            >
              <Icon size={24} className={cell.text} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HeroReel() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      {SLOTS.map((slot) => (
        <div key={slot.label} className="flex flex-col items-center gap-1.5">
          <ReelSlot intervalMs={slot.intervalMs} staggerMs={slot.staggerMs} />
          <span className="text-[10px] uppercase tracking-wider text-gray-500">{slot.label}</span>
        </div>
      ))}
    </div>
  );
}
