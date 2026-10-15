"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, User, RotateCcw, Check } from "lucide-react";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import { type WeaponDetail, type InstancePerk, type DamageTheme, useWeaponTooltip, damageTheme } from "./weaponShared";
import { SLOT_ORDER, SLOT_LABELS } from "@/lib/destiny/constants";
import RevealReel from "@/components/RevealReel";
type AnimKind = "roll" | "pick";

export interface SlotPerk { name: string; icon?: string }

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
  /** The perks on the copy of each weapon this player will equip. */
  slotPerks?: Partial<Record<WeaponSlot, SlotPerk[]>>;
  /** One line per slot comparing this player's copy to the fireteam's. */
  slotNotes?: Partial<Record<WeaponSlot, string>>;
}

// The stage tile: big enough to be the screen's focal point, still crisp
// from Bungie's 96px source icons.
const TILE = 168;
const REEL_PRE_COUNT = 15;
const SLOT_STAGGER_MS: Record<string, number> = { kinetic: 0, energy: 160, power: 320 };

type SlotMode = "normal" | "lock" | "wildcard";

const EXOTIC = "#ceae33";
const LEGENDARY = "#8a57a8";

/** The animated weapon reel tile, with the rarity bar along its bottom edge. */
function WeaponTile({
  hash, icon, watermark, exotic, iconPool, slot, animKindRef, onHover, onLeave, onSpinningChange,
}: {
  hash: number; icon: string; watermark?: string; exotic: boolean;
  iconPool: string[]; slot: string;
  animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
  onHover: (hash: number, e: React.MouseEvent<HTMLElement>) => void;
  onLeave: () => void;
  onSpinningChange: (spinning: boolean) => void;
}) {
  const [landed, setLanded] = useState(false);
  const [picked, setPicked] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const [revealKey, setRevealKey] = useState(0);
  const [animateReveal, setAnimateReveal] = useState(false);
  const firstRender = useRef(true);
  const prevHash = useRef(hash);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevHash.current = hash;
      return;
    }
    if (hash === prevHash.current) return;
    prevHash.current = hash;

    const kind: AnimKind = animKindRef?.current[slot] ?? "roll";
    if (kind === "pick" || iconPool.length < 2) {
      onSpinningChange(false);
      setAnimateReveal(false);
      setRevealKey((key) => key + 1);
      setPicked(true);
      setPopKey((k) => k + 1);
      const t = setTimeout(() => setPicked(false), 600);
      return () => clearTimeout(t);
    }
    setLanded(false);
    setAnimateReveal(true);
    setRevealKey((key) => key + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  return (
    <div
      key={popKey}
      className={`relative shrink-0 overflow-hidden bg-[#16181c] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] ${
        picked ? "animate-pick-pop" : ""
      } ${landed ? "animate-slot-land" : ""}`}
      style={{ width: TILE, height: TILE }}
      onMouseEnter={(e) => onHover(hash, e)}
      onMouseLeave={onLeave}
    >
      <RevealReel
        target={icon}
        fillers={iconPool}
        revealKey={revealKey}
        itemSize={TILE}
        fillerCount={REEL_PRE_COUNT}
        animate={animateReveal}
        delayMs={SLOT_STAGGER_MS[slot] ?? 0}
        durationMs={900}
        watermark={watermark}
        onSpinningChange={onSpinningChange}
        onLanded={() => {
          setLanded(true);
          setTimeout(() => setLanded(false), 600);
        }}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[5px]" style={{ background: exotic ? EXOTIC : LEGENDARY }} aria-hidden="true" />
    </div>
  );
}

function SlotColumn({
  slotName, slot, detail, mode, theme, iconPool, animKindRef, collectionHashes, perks, note,
  isCaptain, onCycleSlotMode, onRerollSlot, rerollExhausted, onHover, onLeave, first,
}: {
  slotName: WeaponSlot; slot?: LobbyLoadoutSlot; detail?: WeaponDetail; mode: SlotMode; theme: DamageTheme;
  iconPool: string[]; animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
  collectionHashes: Set<number>; perks?: SlotPerk[]; note?: string;
  isCaptain?: boolean; onCycleSlotMode?: (slot: WeaponSlot) => void; onRerollSlot?: (slot: WeaponSlot) => void;
  rerollExhausted?: boolean;
  onHover: (hash: number, e: React.MouseEvent<HTMLElement>) => void; onLeave: () => void; first: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  const isWildcard = mode === "wildcard" || slot?.item_hash === 0;
  const hasWeapon = !!slot && slot.item_hash !== 0 && !isWildcard;
  const exotic = (detail?.tierType ?? 5) === 6;
  const rarityText = exotic ? "text-[#ceae33]" : "text-[#c7a6dc]";

  return (
    <section
      aria-label={`${SLOT_LABELS[slotName]} slot`}
      className={`flex min-w-0 flex-col items-center gap-5 px-4 py-8 text-center ${first ? "" : "md:border-l md:border-bungie-border"} border-t border-bungie-border md:border-t-0`}
    >
      <span className="section-label">{SLOT_LABELS[slotName]}</span>

      {isWildcard ? (
        <>
          <div className="grid place-items-center bg-[#16181c] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" style={{ width: TILE, height: TILE }}>
            <User size={40} className="text-gray-500" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-wide text-[26px] font-bold leading-none text-gray-200">Your own</h3>
            <p className="mt-2.5 text-sm text-gray-400">Everyone keeps what they have equipped</p>
          </div>
        </>
      ) : slot ? (
        <>
          <WeaponTile
            hash={slot.item_hash}
            icon={slot.weapon_icon}
            watermark={detail?.watermark}
            exotic={exotic}
            iconPool={iconPool}
            slot={slotName}
            animKindRef={animKindRef}
            onHover={onHover}
            onLeave={onLeave}
            onSpinningChange={setSpinning}
          />
          <div className={`min-w-0 max-w-full ${spinning ? "opacity-0" : "animate-fade-in"}`} aria-live="polite">
            <h3 className="font-wide break-words text-[30px] font-bold leading-none text-white">{slot.weapon_name}</h3>
            <p className={`mt-2.5 text-sm ${rarityText}`}>
              {exotic ? "Exotic" : "Legendary"} {slot.weapon_type?.toLowerCase()}
              {slot.damage_type && <> | <span className={theme.text}>{slot.damage_type}</span></>}
            </p>
            {collectionHashes.has(slot.item_hash) && (
              <p className="mt-2 text-xs text-amber-300">Pull it from Collections first</p>
            )}
          </div>
          {perks && perks.length > 0 && (
            <ul className={`flex justify-center gap-3 ${spinning ? "opacity-0" : "animate-fade-in"}`} aria-label="Your perks">
              {perks.slice(0, 3).map((p) => (
                <li key={p.name} className="flex w-[84px] flex-col items-center gap-2">
                  {p.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.icon} alt="" className="h-11 w-11 rounded-full bg-[#23344a]" />
                  ) : (
                    <span className="h-11 w-11 rounded-full bg-[#23344a]" aria-hidden="true" />
                  )}
                  <span className="text-xs leading-tight text-gray-400">{p.name}</span>
                </li>
              ))}
            </ul>
          )}
          {note && <p className={`max-w-[30ch] text-[13px] text-gray-500 ${spinning ? "opacity-0" : ""}`}>{note}</p>}
        </>
      ) : (
        <>
          <div className="grid place-items-center bg-[#16181c] text-3xl text-gray-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" style={{ width: TILE, height: TILE }} aria-hidden="true">?</div>
          <p className="text-sm text-gray-500">Not rolled yet</p>
        </>
      )}

      {isCaptain && (onCycleSlotMode || onRerollSlot) && (
        <div className="mt-auto flex gap-2">
          {onRerollSlot && hasWeapon && (
            <button
              type="button"
              onClick={() => onRerollSlot(slotName)}
              disabled={rerollExhausted}
              aria-label={`Reroll only the ${SLOT_LABELS[slotName]} slot`}
              className="inline-flex h-10 items-center gap-1.5 border border-white/15 px-4 text-sm font-semibold text-gray-100 transition-colors hover:border-white/30 hover:bg-white/5 disabled:opacity-35"
            >
              <RotateCcw size={14} /> Reroll
            </button>
          )}
          {onCycleSlotMode && (
            <button
              type="button"
              onClick={() => onCycleSlotMode(slotName)}
              aria-label={`Slot mode: ${mode === "lock" ? "locked" : mode === "wildcard" ? "your own" : "rolls"}. Click to change`}
              className={`inline-flex h-10 items-center gap-1.5 border px-4 text-sm font-semibold transition-colors ${
                mode === "normal"
                  ? "border-white/15 text-gray-400 hover:border-white/30 hover:text-gray-100"
                  : "border-bungie-blue bg-bungie-blue text-bungie-dark"
              }`}
            >
              {mode === "lock" ? <><Check size={14} /> Locked</> : mode === "wildcard" ? <><User size={14} /> Your own</> : <><Lock size={14} /> Lock</>}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function LoadoutQueue({
  slots, weaponDetails, instancePerks = {}, collectionHashes = new Set(), animKindRef,
  isCaptain, lockedSlots, wildcardSlots, onCycleSlotMode, onRerollSlot, rerollExhausted, slotPerks, slotNotes,
}: Props) {
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
    <div className="grid grid-cols-1 md:grid-cols-3">
      {tooltipNode}
      {SLOT_ORDER.map((slotName, idx) => {
        const slot = slots.find((s) => s.slot === slotName);
        const mode: SlotMode = lockedSlots?.has(slotName) ? "lock" : wildcardSlots?.has(slotName) ? "wildcard" : "normal";
        const hasWeapon = !!slot && slot.item_hash !== 0;
        return (
          <SlotColumn
            key={slotName}
            first={idx === 0}
            slotName={slotName}
            slot={slot}
            detail={hasWeapon ? weaponDetails[slot!.item_hash] : undefined}
            mode={mode}
            theme={damageTheme(hasWeapon ? slot!.damage_type : undefined)}
            iconPool={iconPool}
            animKindRef={animKindRef}
            collectionHashes={collectionHashes}
            perks={slotPerks?.[slotName]}
            note={slotNotes?.[slotName]}
            isCaptain={isCaptain}
            onCycleSlotMode={onCycleSlotMode}
            onRerollSlot={onRerollSlot}
            rerollExhausted={rerollExhausted}
            onHover={onHover}
            onLeave={onLeave}
          />
        );
      })}
    </div>
  );
}
