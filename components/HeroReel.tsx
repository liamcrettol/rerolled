"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroWeaponSample } from "@/lib/bungie/definitions";
import type { WeaponSlot } from "@/types/bungie";
import RevealReel from "@/components/RevealReel";
import { RARITY_EDGE_COLORS, SLOT_ORDER } from "@/lib/destiny/constants";

// Purely decorative "loadout roll" for the signed-out landing hero, spinning
// through real weapon icons (sampled server-side, grouped by real slot - see
// getRandomWeaponSample) using the exact scroll-and-land reel mechanic
// WeaponSlotContent uses for real rolls in LoadoutQueue.tsx, just keyed off a
// random interval instead of an actual captain's roll. Each reel only draws
// from its own slot's pool (a Heavy weapon can never land in Kinetic, etc.),
// and at most one of the 3 slots shows an Exotic at a time, matching
// Destiny's real "one exotic equipped" rule.
//
// Perf notes: plain <img> instead of next/image (these are decorative,
// always-blurred, and already unoptimized - next/image's lazy-load/observer
// machinery is pure overhead here). The blurred pre-roll cycles through a
// small fixed filler pool per slot instead of fresh random picks every spin,
// so the browser only ever decodes those handful of images once instead of
// fetching brand-new ones every ~3s. A new spin always seeds positions 0/1
// with the sliver + weapon currently on screen, so resetting the scroll
// offset never swaps an <img> src outside of the scroll transition (that
// swap-without-a-transition was the cause of the "gray flash" on landing).
const REEL_ITEM_H = 88;
// The window is taller than one item so faded slivers of the neighboring reel
// entries peek through above and below the landed weapon - that's what makes
// it read as a physical reel instead of images swapping in place.
const REEL_WINDOW_H = 124;
const FILLER_POOL_SIZE = 8;
const SPIN_MS = 950;
// First spin starts almost immediately instead of waiting a full interval.
const INITIAL_DELAY_MS = 250;
const EXOTIC_TIER = 6;
// Flat rarity edge while a weapon sits landed — in-game item-tile colors.
// Exported so other static "landed weapon" visuals (e.g. the landing page's
// fireteam-intersection moment) reuse the same rarity-edge colors.
export const EDGE = RARITY_EDGE_COLORS;

const SLOTS: Array<{ slot: WeaponSlot; intervalMs: number; staggerMs: number }> = SLOT_ORDER.map((slot, index) => ({
  slot,
  intervalMs: 2800,
  staggerMs: index * 220,
}));

function pickTarget(weapons: HeroWeaponSample[], allowExotic: boolean, exclude?: number): number {
  const candidates: number[] = [];
  for (let i = 0; i < weapons.length; i++) {
    if (i === exclude) continue;
    if (!allowExotic && weapons[i].tierType === EXOTIC_TIER) continue;
    candidates.push(i);
  }
  const pool = candidates.length > 0 ? candidates : weapons.map((_, i) => i).filter((i) => i !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] ?? 0;
}

function pickFillerPool(weapons: HeroWeaponSample[]): number[] {
  const size = Math.min(FILLER_POOL_SIZE, weapons.length);
  const seen = new Set<number>();
  while (seen.size < size) seen.add(pickTarget(weapons, true));
  return [...seen];
}

function ReelSlot({
  weapons, intervalMs, staggerMs, initialTarget, canShowExotic, onLand,
}: {
  weapons: HeroWeaponSample[];
  intervalMs: number;
  staggerMs: number;
  initialTarget: number;
  canShowExotic: () => boolean;
  onLand: (isExotic: boolean) => void;
}) {
  const fillerPoolRef = useRef<number[] | null>(null);
  if (!fillerPoolRef.current) fillerPoolRef.current = pickFillerPool(weapons);
  const [targetIndex, setTargetIndex] = useState(initialTarget);
  const [revealKey, setRevealKey] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const currentIndexRef = useRef(initialTarget);

  // Self-scheduling spin loop: decide the next weapon, spin to it, land, then
  // schedule the next spin - all in one place so timers are easy to track and
  // clear on unmount.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, delay: number) => timers.push(setTimeout(fn, delay));
    const spin = () => {
      const next = pickTarget(weapons, canShowExotic(), currentIndexRef.current);
      onLand(weapons[next]?.tierType === EXOTIC_TIER);
      setTargetIndex(next);
      setRevealKey((key) => key + 1);
      currentIndexRef.current = next;

      schedule(spin, intervalMs);
    };

    schedule(spin, INITIAL_DELAY_MS + staggerMs);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const landedTier = weapons[targetIndex]?.tierType;
  const edge = landedTier === EXOTIC_TIER ? EDGE.exotic : EDGE.legendary;
  // Rarity-tinted 1px edge that stays lit while the weapon sits landed, and
  // drops back to the neutral frame as the next spin starts.
  const frameShadow = spinning ? "none" : `0 0 0 1px ${edge}`;

  return (
    <div
      className="relative shrink-0 border border-white/10 bg-bungie-surface"
      style={{
        width: REEL_ITEM_H,
        height: REEL_WINDOW_H,
        boxShadow: frameShadow,
        transition: "box-shadow 400ms ease",
      }}
    >
      <RevealReel
        target={weapons[targetIndex].icon}
        fillers={fillerPoolRef.current.map((index) => weapons[index].icon)}
        revealKey={revealKey}
        itemSize={REEL_ITEM_H}
        windowSize={REEL_WINDOW_H}
        fillerCount={8}
        durationMs={SPIN_MS}
        easing="cubic-bezier(0.22, 1.06, 0.32, 1)"
        onSpinningChange={setSpinning}
      />
    </div>
  );
}

function HeroReelActive({ weaponsBySlot }: { weaponsBySlot: Record<WeaponSlot, HeroWeaponSample[]> }) {
  const initialTargetsRef = useRef<number[] | undefined>(undefined);
  if (!initialTargetsRef.current) {
    let exoticUsed = false;
    initialTargetsRef.current = SLOTS.map(({ slot }) => {
      const pool = weaponsBySlot[slot];
      const idx = pickTarget(pool, !exoticUsed);
      if (pool[idx]?.tierType === EXOTIC_TIER) exoticUsed = true;
      return idx;
    });
  }
  const initialTargets = initialTargetsRef.current;
  const initialExoticSlot = SLOTS.findIndex(
    ({ slot }, i) => weaponsBySlot[slot][initialTargets[i]]?.tierType === EXOTIC_TIER
  );
  const exoticSlotRef = useRef<number | null>(initialExoticSlot === -1 ? null : initialExoticSlot);

  return (
    <div className="flex items-center gap-5" aria-hidden="true">
      {SLOTS.map(({ slot, intervalMs, staggerMs }, i) => (
        <ReelSlot
          key={i}
          weapons={weaponsBySlot[slot]}
          intervalMs={intervalMs}
          staggerMs={staggerMs}
          initialTarget={initialTargets[i]}
          canShowExotic={() => exoticSlotRef.current === null || exoticSlotRef.current === i}
          onLand={(isExotic) => {
            if (isExotic) exoticSlotRef.current = i;
            else if (exoticSlotRef.current === i) exoticSlotRef.current = null;
          }}
        />
      ))}
    </div>
  );
}

export default function HeroReel({ weaponsBySlot }: { weaponsBySlot: Record<WeaponSlot, HeroWeaponSample[]> }) {
  // Mounts the real (randomized) reel only after hydration - picking targets
  // with Math.random() during the initial render would produce a different
  // result on the server vs. the client and trigger a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasWeapons = SLOTS.every(({ slot }) => weaponsBySlot[slot]?.length > 0);
  if (!hasWeapons) return null;

  if (!mounted) {
    return (
      <div className="flex items-center gap-5" aria-hidden="true">
        {SLOTS.map((s) => (
          <div
            key={s.slot}
            className="overflow-hidden shrink-0 border border-white/10 bg-bungie-surface"
            style={{ width: REEL_ITEM_H, height: REEL_WINDOW_H }}
          />
        ))}
      </div>
    );
  }

  return <HeroReelActive weaponsBySlot={weaponsBySlot} />;
}
