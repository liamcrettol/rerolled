"use client";

import Image from "next/image";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import { type WeaponDetail, type InstancePerk, useWeaponTooltip } from "./weaponShared";

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
}

const SLOT_ORDER = ["kinetic", "energy", "power"];

export default function LoadoutQueue({
  slots, weaponDetails, instancePerks = {}, collectionHashes = new Set(),
  onApply, onCancelApply, selectedCharId, loading,
}: Props) {
  const sorted = SLOT_ORDER.map((s) => slots.find((x) => x.slot === s)).filter(Boolean) as LobbyLoadoutSlot[];
  const { onHover, onLeave, node: tooltipNode } = useWeaponTooltip(weaponDetails, instancePerks, collectionHashes);

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
      {tooltipNode}
      <h2 className="text-white font-semibold mb-4">Current Loadout</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {SLOT_ORDER.map((slotName) => {
          const slot = sorted.find((s) => s.slot === slotName);
          const isWildcard = slot?.item_hash === 0;
          const hasWeapon = !!slot && slot.item_hash !== 0;
          return (
            <div
              key={slotName}
              onMouseMove={hasWeapon ? (e) => onHover(slot!.item_hash, e.clientX, e.clientY) : undefined}
              onMouseLeave={hasWeapon ? onLeave : undefined}
              className={`flex flex-col items-center gap-2 rounded-lg p-3 border transition ${
                isWildcard
                  ? "bg-bungie-dark/40 border-gray-700/40"
                  : hasWeapon
                  ? "bg-bungie-dark border-bungie-border hover:border-bungie-blue/60 cursor-help"
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
                <>
                  <div className="relative w-14 h-14">
                    <Image
                      src={slot.weapon_icon}
                      alt={slot.weapon_name}
                      fill
                      className="object-cover rounded"
                      unoptimized
                    />
                    {weaponDetails[slot.item_hash]?.watermark && (
                      <Image
                        src={weaponDetails[slot.item_hash].watermark!}
                        alt=""
                        fill
                        className="object-cover rounded pointer-events-none"
                        unoptimized
                      />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-white text-xs font-semibold leading-tight">
                      {slot.weapon_name}
                    </p>
                    <p className="text-gray-400 text-xs">{slot.weapon_type}</p>
                    <p className="text-gray-500 text-xs">{slot.damage_type}</p>
                  </div>
                </>
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
