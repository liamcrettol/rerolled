"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import { type WeaponDetail, type InstancePerk, useWeaponTooltip, damageTheme, DAMAGE_COLOR } from "./weaponShared";
type AnimKind = "roll" | "pick";

const SLOT_LABELS: Record<string, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

interface Props {
  slots: LobbyLoadoutSlot[];
  weaponDetails: Record<string, WeaponDetail>;
  instancePerks?: Record<string, InstancePerk[]>;
  collectionHashes?: Set<number>;
  onApply: () => void;
  onCancelApply: () => void;
  selectedCharId: string | null;
  loading: boolean;
  // Why each slot last changed: "roll" → slot-machine spin, "pick" → quick pop.
  animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
}

const SLOT_ORDER = ["kinetic", "energy", "power"];
const SPIN_STEP_MS = 60;
const SPIN_TOTAL_MS = 700;

// Slot-machine slot: when the weapon hash changes, flicker through random
// pooled icons for a beat, then snap to the final. The name/type/damage are
// held back ("Rolling...") until the icon settles, so the result isn't
// spoiled before the spin finishes.
function WeaponSlotContent({
  hash, icon, watermark, name, weaponType, damageType, isCollection, iconPool, slot, animKindRef,
}: {
  hash: number; icon: string; watermark?: string; name: string; weaponType: string;
  damageType: string; isCollection: boolean; iconPool: string[];
  slot: string; animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
}) {
  const [displayIcon, setDisplayIcon] = useState(icon);
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState(false); // transient: manual-pick pop+glow
  const [popKey, setPopKey] = useState(0); // bump to replay the pop animation
  const firstRender = useRef(true);
  const prevHash = useRef(hash);

  useEffect(() => {
    // Don't animate the initial mount or non-changes (e.g. weaponDetails loading)
    if (firstRender.current) { firstRender.current = false; prevHash.current = hash; setDisplayIcon(icon); return; }
    if (hash === prevHash.current) { setDisplayIcon(icon); return; }
    prevHash.current = hash;

    const kind: AnimKind = animKindRef?.current[slot] ?? "roll";

    // Manual pick from the browser: no shuffle - snap in with a quick pop.
    if (kind === "pick" || iconPool.length < 2) {
      setDisplayIcon(icon);
      setSpinning(false);
      setPicked(true);
      setPopKey((k) => k + 1);
      const t = setTimeout(() => setPicked(false), 600);
      return () => clearTimeout(t);
    }

    setPicked(false);
    setSpinning(true);
    let elapsed = 0;
    const id = setInterval(() => {
      elapsed += SPIN_STEP_MS;
      setDisplayIcon(iconPool[Math.floor(Math.random() * iconPool.length)]);
      if (elapsed >= SPIN_TOTAL_MS) {
        clearInterval(id);
        setDisplayIcon(icon);
        setSpinning(false);
      }
    }, SPIN_STEP_MS);
    return () => clearInterval(id);
  }, [hash, icon, iconPool, slot, animKindRef]);

  return (
    <>
      <div
        key={popKey}
        className={`relative w-14 h-14 transition-transform duration-150 ${
          spinning ? "blur-[1px] scale-110" : picked ? "animate-pick-pop ring-2 ring-bungie-blue rounded" : "scale-100"
        }`}
      >
        <Image src={displayIcon} alt={spinning ? "" : name} fill className="object-cover rounded" unoptimized />
        {!spinning && watermark && (
          <Image src={watermark} alt="" fill className="object-cover rounded pointer-events-none" unoptimized />
        )}
      </div>
      <div className="text-center">
        {spinning ? (
          <p className="text-bungie-blue text-xs font-semibold animate-pulse">Rolling…</p>
        ) : (
          <>
            <p className="text-white text-xs font-semibold leading-tight">{name}</p>
            <p className="text-gray-400 text-xs">{weaponType}</p>
            <p className={`text-xs ${DAMAGE_COLOR[damageType] ?? "text-gray-500"}`}>{damageType}</p>
            {isCollection && (
              <span className="mt-1 inline-block text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded px-1.5 py-0.5 leading-none">
                Pull from Collections
              </span>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function LoadoutQueue({
  slots, weaponDetails, instancePerks = {}, collectionHashes = new Set(),
  onApply, onCancelApply, selectedCharId, loading, animKindRef,
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
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
      {tooltipNode}
      <h2 className="text-white font-semibold mb-4">Current Loadout</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {SLOT_ORDER.map((slotName) => {
          const slot = sorted.find((s) => s.slot === slotName);
          const isWildcard = slot?.item_hash === 0;
          const hasWeapon = !!slot && slot.item_hash !== 0;
          const theme = hasWeapon ? damageTheme(slot!.damage_type) : null;
          return (
            <div
              key={slotName}
              onMouseEnter={hasWeapon ? (e) => onHover(slot!.item_hash, e.currentTarget) : undefined}
              onMouseLeave={hasWeapon ? onLeave : undefined}
              className={`flex flex-col items-center gap-2 rounded-lg p-3 border transition ${
                isWildcard
                  ? "bg-bungie-dark/40 border-gray-700/40"
                  : hasWeapon && theme
                  ? `${theme.bg} ${theme.border} cursor-help`
                  : "bg-bungie-dark border-bungie-border"
              }`}
            >
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                {SLOT_LABELS[slotName]}
              </span>
              {slot && slot.item_hash === 0 ? (
                <>
                  <div className="w-14 h-14 rounded bg-gray-800/50 border border-gray-700/50 flex items-center justify-center text-2xl opacity-50 grayscale">
                    👤
                  </div>
                  <div className="text-center opacity-60">
                    <p className="text-gray-400 text-xs font-semibold">Your Own</p>
                    <p className="text-gray-500 text-xs">Skipped on apply</p>
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
                  iconPool={iconPool}
                  slot={slotName}
                  animKindRef={animKindRef}
                />
              ) : (
                <div className="w-14 h-14 rounded bg-gray-800 flex items-center justify-center text-gray-600 text-xl">
                  ?
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onApply}
          disabled={!selectedCharId || loading || sorted.length < 3}
          className="px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-lg transition text-sm"
        >
          {loading ? "Applying…" : "⚡ Apply Loadout"}
        </button>
        {loading && (
          <button
            onClick={onCancelApply}
            className="px-3 py-2.5 border border-red-800 text-red-400 hover:text-red-300 hover:border-red-600 rounded-lg text-sm transition"
          >
            Cancel
          </button>
        )}
        {!selectedCharId && !loading && (
          <span className="text-xs text-yellow-400">Select a character first</span>
        )}
        {!loading && <span className="text-xs text-gray-500">Must be in orbit or social space</span>}
      </div>
    </div>
  );
}
