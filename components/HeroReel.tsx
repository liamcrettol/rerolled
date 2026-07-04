"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroWeaponSample } from "@/lib/bungie/definitions";
import type { WeaponSlot } from "@/types/bungie";

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
const REEL_PRE_COUNT = 8;
const FILLER_POOL_SIZE = 8;
const SPIN_MS = 950;
// First spin starts almost immediately instead of waiting a full interval.
const INITIAL_DELAY_MS = 250;
const EXOTIC_TIER = 6;
const GLOW = {
  exotic:    { edge: "rgba(255, 191, 74, 0.4)",  bloom: "rgba(255, 191, 74, 0.45)" },
  legendary: { edge: "rgba(190, 110, 255, 0.35)", bloom: "rgba(190, 110, 255, 0.4)" },
};
const INSET_HIGHLIGHT = "inset 0 1px 0 rgba(255,255,255,0.06)";
const REEL_MASK = "linear-gradient(to bottom, transparent 0%, black 24%, black 76%, transparent 100%)";

// translateY that vertically centers reel item `i` in the window.
const offsetFor = (i: number) => (REEL_WINDOW_H - REEL_ITEM_H) / 2 - i * REEL_ITEM_H;

const SLOTS: Array<{ slot: WeaponSlot; label: string; intervalMs: number; staggerMs: number }> = [
  { slot: "kinetic", label: "Kinetic", intervalMs: 2800, staggerMs: 0 },
  { slot: "energy", label: "Energy", intervalMs: 2800, staggerMs: 220 },
  { slot: "power", label: "Power", intervalMs: 2800, staggerMs: 440 },
];

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
  // Reel layout: [sliver above, current, ...fillers, target, sliver below].
  // The window centers one item; its neighbors show through the mask fade.
  const [reelItems, setReelItems] = useState<number[]>(() => {
    const f = fillerPoolRef.current!;
    return [f[0], initialTarget, f[1 % f.length]];
  });
  const [spinning, setSpinning] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(initialTarget);
  // Whatever sliver is visible above the centered item at rest - re-seeded at
  // position 0 on the next spin so resetting the offset never changes pixels.
  const aboveRef = useRef<number>(fillerPoolRef.current[0]);

  // Self-scheduling spin loop: decide the next weapon, spin to it, land, then
  // schedule the next spin - all in one place so timers are easy to track and
  // clear on unmount.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, delay: number) => timers.push(setTimeout(fn, delay));
    const fillers = fillerPoolRef.current!;

    const spin = () => {
      const next = pickTarget(weapons, canShowExotic(), currentIndexRef.current);
      onLand(weapons[next]?.tierType === EXOTIC_TIER);
      const randoms = Array.from(
        { length: REEL_PRE_COUNT },
        () => fillers[Math.floor(Math.random() * fillers.length)]
      );
      const below = fillers[Math.floor(Math.random() * fillers.length)];
      // Seed positions 0/1 with the sliver + weapon currently on screen so
      // resetting the scroll offset below never visually jumps.
      setReelItems([aboveRef.current, currentIndexRef.current, ...randoms, next, below]);
      aboveRef.current = randoms[randoms.length - 1];
      setSpinning(true);

      schedule(() => {
        setSpinning(false);
        currentIndexRef.current = next;
      }, SPIN_MS + 50);

      schedule(spin, intervalMs);
    };

    schedule(spin, INITIAL_DELAY_MS + staggerMs);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kick off the CSS scroll once reelItems + spinning are set.
  useEffect(() => {
    if (!spinning || reelItems.length < 4) return;
    const reel = reelRef.current;
    if (!reel) return;

    // Land centered on the second-to-last item (the last is the below-sliver).
    const targetY = offsetFor(reelItems.length - 2);
    reel.style.transition = "none";
    reel.style.transform = `translateY(${offsetFor(1)}px)`;
    // Force a synchronous reflow so the reset above commits before the
    // animated move below - unlike double-rAF, this also works in throttled
    // or backgrounded tabs, which otherwise freeze the reel mid-reset.
    void reel.offsetHeight;
    // y1 > 1 overshoots the stop a few px then settles back - the mechanical
    // "clunk" of a real reel notching into place.
    reel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.22, 1.06, 0.32, 1)`;
    reel.style.transform = `translateY(${targetY}px)`;
  }, [spinning, reelItems]);

  const landedTier = weapons[currentIndexRef.current]?.tierType;
  const glow = landedTier === EXOTIC_TIER ? GLOW.exotic : GLOW.legendary;
  // Rarity-tinted edge + bloom that stays lit while the weapon sits landed,
  // and fades out as the next spin starts.
  const frameShadow = spinning
    ? INSET_HIGHLIGHT
    : `${INSET_HIGHLIGHT}, 0 0 0 1px ${glow.edge}, 0 0 26px -6px ${glow.bloom}`;

  return (
    <div
      className="relative rounded-2xl overflow-hidden shrink-0 border border-white/10 bg-gray-900/80"
      style={{
        width: REEL_ITEM_H,
        height: REEL_WINDOW_H,
        boxShadow: frameShadow,
        transition: "box-shadow 500ms ease",
      }}
    >
      <div
        className="h-full"
        style={{ maskImage: REEL_MASK, WebkitMaskImage: REEL_MASK }}
      >
        <div
          ref={reelRef}
          style={{ willChange: "transform", transform: `translateY(${offsetFor(1)}px)` }}
        >
          {reelItems.map((wi, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={weapons[wi].icon}
              alt=""
              loading="eager"
              decoding="async"
              style={{
                width: REEL_ITEM_H,
                height: REEL_ITEM_H,
                objectFit: "cover",
                display: "block",
                filter: "blur(3px)",
              }}
            />
          ))}
        </div>
      </div>
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
    <div className="flex items-start gap-5" aria-hidden="true">
      {SLOTS.map(({ slot, label, intervalMs, staggerMs }, i) => (
        <div key={i} className="flex flex-col items-center gap-2.5">
          <ReelSlot
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
          <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500 select-none">
            {label}
          </span>
        </div>
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
      <div className="flex items-start gap-5" aria-hidden="true">
        {SLOTS.map((s) => (
          <div key={s.slot} className="flex flex-col items-center gap-2.5">
            <div
              className="rounded-2xl overflow-hidden shrink-0 border border-white/10 bg-gray-900/80"
              style={{ width: REEL_ITEM_H, height: REEL_WINDOW_H, boxShadow: INSET_HIGHLIGHT }}
            />
            <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500 select-none">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return <HeroReelActive weaponsBySlot={weaponsBySlot} />;
}
