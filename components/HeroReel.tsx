"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
const REEL_ITEM_H = 64;
const REEL_PRE_COUNT = 10;
const SPIN_MS = 900;
// First spin starts almost immediately instead of waiting a full interval.
const INITIAL_DELAY_MS = 250;
const EXOTIC_TIER = 6;
const EXOTIC_GLOW = "rgba(255, 191, 74, 0.7)";
const LEGENDARY_GLOW = "rgba(190, 110, 255, 0.55)";

const SLOTS: Array<{ slot: WeaponSlot; intervalMs: number; staggerMs: number }> = [
  { slot: "kinetic", intervalMs: 2800, staggerMs: 0 },
  { slot: "energy", intervalMs: 2800, staggerMs: 160 },
  { slot: "power", intervalMs: 2800, staggerMs: 320 },
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
  const [reelItems, setReelItems] = useState<number[]>([initialTarget]);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
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
      const randoms = Array.from({ length: REEL_PRE_COUNT }, () => pickTarget(weapons, true));
      setReelItems([...randoms, next]);
      setSpinning(true);
      setLanded(false);

      schedule(() => {
        setSpinning(false);
        setReelItems([next]);
        currentIndexRef.current = next;
        setLanded(true);
        schedule(() => setLanded(false), 550);
      }, SPIN_MS + 50);

      schedule(spin, intervalMs);
    };

    schedule(spin, INITIAL_DELAY_MS + staggerMs);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        reel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.1, 0.6, 0.3, 1)`;
        reel.style.transform = `translateY(${targetY}px)`;
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [spinning, reelItems]);

  const landedTier = weapons[currentIndexRef.current]?.tierType;
  const landGlow = landedTier === EXOTIC_TIER ? EXOTIC_GLOW : LEGENDARY_GLOW;

  return (
    <div
      className={`relative rounded-xl overflow-hidden shrink-0 bg-gray-800 ${landed ? "animate-weapon-land" : ""}`}
      style={{ width: REEL_ITEM_H, height: REEL_ITEM_H, "--land-glow": landGlow } as React.CSSProperties}
    >
      <div ref={reelRef} style={{ willChange: "transform", filter: "blur(3px)" }}>
        {reelItems.map((wi, i) => (
          <div key={i} style={{ width: REEL_ITEM_H, height: REEL_ITEM_H, position: "relative" }}>
            <Image src={weapons[wi].icon} alt="" fill className="object-cover" unoptimized />
          </div>
        ))}
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
    <div className="flex items-center gap-4" aria-hidden="true">
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
      <div className="flex items-center gap-4" aria-hidden="true">
        {SLOTS.map((s) => (
          <div
            key={s.slot}
            className="rounded-xl overflow-hidden shrink-0 bg-gray-800"
            style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
          />
        ))}
      </div>
    );
  }

  return <HeroReelActive weaponsBySlot={weaponsBySlot} />;
}
