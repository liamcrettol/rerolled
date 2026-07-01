"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Shuffle, Lock, User } from "lucide-react";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import { type WeaponDetail, type InstancePerk, useWeaponTooltip, damageTheme } from "./weaponShared";
type AnimKind = "roll" | "pick";

interface Props {
  slots: LobbyLoadoutSlot[];
  weaponDetails: Record<string, WeaponDetail>;
  instancePerks?: Record<string, InstancePerk[]>;
  collectionHashes?: Set<number>;
  animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
  isCaptain?: boolean;
  lockedSlots?: Set<string>;
  wildcardSlots?: Set<string>;
  onCycleSlotMode?: (slot: WeaponSlot) => void;
  onRerollSlot?: (slot: WeaponSlot) => void;
  rerollExhausted?: boolean;
}

const SLOT_ORDER = ["kinetic", "energy", "power"];
const REEL_ITEM_H = 120;
const REEL_PRE_COUNT = 15;
const SLOT_STAGGER_MS: Record<string, number> = { kinetic: 0, energy: 160, power: 320 };

type SlotMode = "normal" | "lock" | "wildcard";
const SLOT_MODE_ICONS: Record<SlotMode, typeof Shuffle> = { normal: Shuffle, lock: Lock, wildcard: User };

function WeaponSlotContent({
  hash, icon, watermark, name, weaponType, isCollection,
  iconPool, slot, animKindRef,
}: {
  hash: number; icon: string; watermark?: string; name: string;
  weaponType: string; isCollection: boolean;
  iconPool: string[]; slot: string;
  animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
}) {
  const [reelItems, setReelItems] = useState<string[]>([icon]);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const [picked, setPicked] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const reelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const prevHash = useRef(hash);

  // Effect 1: detect hash change, build reel items
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevHash.current = hash;
      setReelItems([icon]);
      return;
    }
    if (hash === prevHash.current) return;
    prevHash.current = hash;

    const kind: AnimKind = animKindRef?.current[slot] ?? "roll";

    if (kind === "pick" || iconPool.length < 2) {
      setReelItems([icon]);
      setSpinning(false);
      setPicked(true);
      setPopKey((k) => k + 1);
      const t = setTimeout(() => setPicked(false), 600);
      return () => clearTimeout(t);
    }

    const delay = SLOT_STAGGER_MS[slot] ?? 0;
    const staggerTimer = setTimeout(() => {
      const randoms = Array.from({ length: REEL_PRE_COUNT }, () =>
        iconPool[Math.floor(Math.random() * iconPool.length)]
      );
      setReelItems([...randoms, icon]);
      setSpinning(true);
      setLanded(false);
    }, delay);
    return () => clearTimeout(staggerTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  // Effect 2: once reelItems + spinning are set, kick off CSS transition
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
      setReelItems([icon]);
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

  return (
    <>
      <div
        key={popKey}
        className={`relative rounded-lg overflow-hidden transition-shadow duration-300 ${
          picked ? "animate-pick-pop ring-2 ring-bungie-blue" : ""
        } ${landed ? "animate-slot-land" : ""}`}
        style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
      >
        <div ref={reelRef} style={{ willChange: "transform" }}>
          {reelItems.map((ic, idx) => (
            <div key={idx} style={{ width: REEL_ITEM_H, height: REEL_ITEM_H, position: "relative" }}>
              <Image src={ic} alt="" fill className="object-cover" unoptimized />
              {idx === reelItems.length - 1 && !spinning && watermark && (
                <Image src={watermark} alt="" fill className="object-cover pointer-events-none" unoptimized />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="text-center">
        {spinning ? (
          <p className="text-bungie-blue text-xs font-semibold animate-pulse">Rolling…</p>
        ) : (
          <div className="animate-fade-in">
            <p className="text-white text-xs font-semibold leading-tight">{name}</p>
            <p className="text-gray-400 text-xs">{weaponType}</p>
            {isCollection && (
              <span className="mt-1 inline-block text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded px-1.5 py-0.5 leading-none">
                Pull from Collections
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function LoadoutQueue({
  slots, weaponDetails, instancePerks = {}, collectionHashes = new Set(), animKindRef,
  isCaptain, lockedSlots, wildcardSlots, onCycleSlotMode, onRerollSlot, rerollExhausted,
}: Props) {
  const sorted = SLOT_ORDER.map((s) => slots.find((x) => x.slot === s)).filter(Boolean) as LobbyLoadoutSlot[];
  const { onHover, onLeave, node: tooltipNode } = useWeaponTooltip(weaponDetails, instancePerks, collectionHashes);

  // A capped, deduped pool of weapon icons to flicker through during the spin.
  const iconPool = useMemo(() => {
    const icons = new Set<string>();
    for (const d of Object.values(weaponDetails)) {
      if (d.icon) icons.add(d.icon);
      if (icons.size >= 40) break;
    }
    return [...icons];
  }, [weaponDetails]);

  // Preload the spin icons so the flicker doesn't stutter on first cycle.
  useEffect(() => {
    for (const ic of iconPool) { const img = new window.Image(); img.src = ic; }
  }, [iconPool]);

  return (
    <div className="bg-bungie-surface border border-bungie-border/40 rounded-xl p-5">
      {tooltipNode}
      <div className="grid grid-cols-3 gap-4">
        {SLOT_ORDER.map((slotName) => {
          const slot = sorted.find((s) => s.slot === slotName);
          const isWildcard = slot?.item_hash === 0;
          const hasWeapon = !!slot && slot.item_hash !== 0;
          const theme = hasWeapon ? damageTheme(slot!.damage_type) : null;

          const slotMode: SlotMode = lockedSlots?.has(slotName)
            ? "lock"
            : wildcardSlots?.has(slotName)
            ? "wildcard"
            : "normal";
          const ModeIcon = SLOT_MODE_ICONS[slotMode];

          return (
            <div key={slotName} className="flex flex-col items-center gap-2">
              <div
                onMouseEnter={hasWeapon ? (e) => onHover(slot!.item_hash, e.currentTarget) : undefined}
                onMouseLeave={hasWeapon ? onLeave : undefined}
                className={`relative rounded-xl border transition overflow-hidden ${
                  isWildcard
                    ? "bg-bungie-dark/40 border-gray-700/40"
                    : hasWeapon && theme
                    ? `${theme.bg} ${theme.border} cursor-help`
                    : "bg-bungie-dark border-bungie-border/40"
                }`}
                style={{ width: REEL_ITEM_H }}
              >
                {isWildcard ? (
                  <div style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }} className="flex items-center justify-center opacity-40 animate-pulse">
                    <User size={36} className="text-gray-400" />
                  </div>
                ) : slot ? (
                  <WeaponSlotContent
                    hash={slot.item_hash}
                    icon={slot.weapon_icon}
                    watermark={weaponDetails[slot.item_hash]?.watermark}
                    name={slot.weapon_name}
                    weaponType={slot.weapon_type}
                    isCollection={collectionHashes.has(slot.item_hash)}
                    iconPool={iconPool}
                    slot={slotName}
                    animKindRef={animKindRef}
                  />
                ) : (
                  <div style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }} className="flex items-center justify-center text-gray-600 text-2xl">?</div>
                )}
              </div>

              {isWildcard && (
                <div className="text-center opacity-60">
                  <p className="text-gray-400 text-xs font-semibold">Your Own</p>
                  <p className="text-gray-500 text-[10px]">Skipped on apply</p>
                </div>
              )}

              {isCaptain && (onCycleSlotMode || (onRerollSlot && hasWeapon && !rerollExhausted)) && (
                <div className="flex items-center gap-1.5">
                  {onCycleSlotMode && (
                    <button
                      onClick={() => onCycleSlotMode(slotName as WeaponSlot)}
                      title="Click to cycle: Random → Locked → Your own"
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition inline-flex items-center gap-1 ${
                        slotMode === "lock"
                          ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-300"
                          : slotMode === "wildcard"
                          ? "border-purple-500/60 bg-purple-500/10 text-purple-300"
                          : "border-bungie-border/40 text-gray-500 hover:border-gray-500"
                      }`}
                    >
                      <ModeIcon size={11} className="shrink-0" />
                      {slotMode === "normal" ? "Random" : slotMode === "lock" ? "Locked" : "Yours"}
                    </button>
                  )}
                  {onRerollSlot && hasWeapon && !rerollExhausted && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRerollSlot(slotName as WeaponSlot); }}
                      title={`Reroll ${slotName}`}
                      className="text-[10px] px-1.5 py-0.5 rounded-full border border-bungie-border/40 text-gray-500 hover:border-bungie-blue hover:text-bungie-blue transition"
                    >
                      ↺
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
