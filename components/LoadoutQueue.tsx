"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Shuffle, Lock, User, RotateCcw } from "lucide-react";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import { type WeaponDetail, type InstancePerk, type DamageTheme, useWeaponTooltip, damageTheme } from "./weaponShared";
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
  /** Primary actions (Roll All / Apply) rendered in the panel header. */
  actions?: React.ReactNode;
}

const SLOT_ORDER = ["kinetic", "energy", "power"];
const REEL_ITEM_H = 56;
const REEL_PRE_COUNT = 15;
const SLOT_STAGGER_MS: Record<string, number> = { kinetic: 0, energy: 160, power: 320 };

type SlotMode = "normal" | "lock" | "wildcard";
const SLOT_MODE_ICONS: Record<SlotMode, typeof Shuffle> = { normal: Shuffle, lock: Lock, wildcard: User };

/** The animated weapon reel (icon box) + its name/type text, laid out side by side. */
function WeaponSlotContent({
  hash, icon, watermark, name, weaponType, damageType, isCollection,
  theme, iconPool, slot, animKindRef,
}: {
  hash: number; icon: string; watermark?: string; name: string;
  weaponType: string; damageType: string; isCollection: boolean;
  theme: DamageTheme; iconPool: string[]; slot: string;
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
        className={`relative rounded-lg overflow-hidden border shrink-0 transition-shadow duration-300 ${theme.bg} ${theme.border} ${
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
      <div className="flex-1 min-w-0">
        {spinning ? (
          <p className="text-bungie-blue text-sm font-semibold animate-pulse">Rolling…</p>
        ) : (
          <div className="animate-fade-in">
            <p className="text-white text-sm font-semibold leading-tight truncate">{name}</p>
            <p className="text-xs text-gray-400 truncate">
              {weaponType}
              {damageType && <span className={theme.text}> · {damageType}</span>}
            </p>
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
  isCaptain, lockedSlots, wildcardSlots, onCycleSlotMode, onRerollSlot, rerollExhausted, actions,
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
    <div className="bg-bungie-surface border border-bungie-border/40 rounded-xl overflow-hidden">
      {tooltipNode}

      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-bungie-border/40">
        <h3 className="text-white text-sm font-semibold">Loadout</h3>
        {actions && <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div>}
      </div>

      <div>
        {SLOT_ORDER.map((slotName, idx) => {
          const slot = sorted.find((s) => s.slot === slotName);
          const isWildcard = slot?.item_hash === 0;
          const hasWeapon = !!slot && slot.item_hash !== 0;
          const theme = damageTheme(hasWeapon ? slot!.damage_type : undefined);

          const slotMode: SlotMode = lockedSlots?.has(slotName)
            ? "lock"
            : wildcardSlots?.has(slotName)
            ? "wildcard"
            : "normal";
          const ModeIcon = SLOT_MODE_ICONS[slotMode];
          const showControls = isCaptain && (!!onCycleSlotMode || (!!onRerollSlot && hasWeapon && !rerollExhausted));

          return (
            <div
              key={slotName}
              onMouseEnter={hasWeapon ? (e) => onHover(slot!.item_hash, e.currentTarget) : undefined}
              onMouseLeave={hasWeapon ? onLeave : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                idx > 0 ? "border-t border-bungie-border/30" : ""
              } ${hasWeapon ? "hover:bg-white/[0.02]" : ""}`}
            >
              {/* Damage/slot accent rail */}
              <span
                className={`w-1 self-stretch rounded-full shrink-0 ${hasWeapon ? theme.fill : "bg-gray-700/60"}`}
                aria-hidden
              />

              {/* Slot name */}
              <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-gray-500">{slotName}</span>

              {/* Icon + weapon text */}
              {isWildcard ? (
                <>
                  <div
                    style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
                    className="shrink-0 rounded-lg border border-gray-700/40 bg-bungie-dark/40 flex items-center justify-center opacity-40 animate-pulse"
                  >
                    <User size={26} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 text-sm font-semibold">Your own</p>
                    <p className="text-gray-500 text-[11px]">Skipped on apply</p>
                  </div>
                </>
              ) : slot ? (
                <WeaponSlotContent
                  hash={slot.item_hash}
                  icon={slot.weapon_icon}
                  watermark={weaponDetails[slot.item_hash]?.watermark}
                  name={slot.weapon_name}
                  weaponType={slot.weapon_type}
                  damageType={slot.damage_type}
                  isCollection={collectionHashes.has(slot.item_hash)}
                  theme={theme}
                  iconPool={iconPool}
                  slot={slotName}
                  animKindRef={animKindRef}
                />
              ) : (
                <>
                  <div
                    style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
                    className="shrink-0 rounded-lg border border-bungie-border/40 bg-bungie-dark flex items-center justify-center text-gray-600 text-xl"
                  >
                    ?
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-600 text-sm">Not rolled yet</p>
                  </div>
                </>
              )}

              {/* Captain controls */}
              {showControls && (
                <div className="shrink-0 flex items-center gap-2">
                  {onCycleSlotMode && (
                    <button
                      onClick={() => onCycleSlotMode(slotName as WeaponSlot)}
                      title="Click to cycle: Random → Locked → Your own"
                      className={`text-xs px-3 py-1.5 rounded-lg border transition inline-flex items-center gap-1.5 font-medium ${
                        slotMode === "lock"
                          ? "border-yellow-500/70 bg-yellow-500/15 text-yellow-300 hover:bg-yellow-500/25"
                          : slotMode === "wildcard"
                          ? "border-purple-500/70 bg-purple-500/15 text-purple-300 hover:bg-purple-500/25"
                          : "border-bungie-border text-gray-400 hover:border-gray-400 hover:text-gray-200"
                      }`}
                    >
                      <ModeIcon size={13} className="shrink-0" />
                      {slotMode === "normal" ? "Random" : slotMode === "lock" ? "Locked" : "Yours"}
                    </button>
                  )}
                  {onRerollSlot && hasWeapon && !rerollExhausted && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRerollSlot(slotName as WeaponSlot); }}
                      title={`Reroll ${slotName}`}
                      className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-lg border border-bungie-border text-gray-400 hover:border-bungie-blue hover:text-bungie-blue transition"
                    >
                      <RotateCcw size={13} />
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
