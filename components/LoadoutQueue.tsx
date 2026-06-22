"use client";

import Image from "next/image";
import type { LobbyLoadoutSlot } from "@/types/lobby";

const SLOT_LABELS: Record<string, string> = {
  kinetic: "Kinetic / Top",
  energy: "Energy / Middle",
  power: "Power / Heavy",
};

interface Props {
  slots: LobbyLoadoutSlot[];
  weaponDetails: Record<string, { name: string; icon: string; weaponType: string; damageType: string }>;
  onApply: () => void;
  onCancelApply: () => void;
  selectedCharId: string | null;
  loading: boolean;
}

const SLOT_ORDER = ["kinetic", "energy", "power"];

export default function LoadoutQueue({ slots, onApply, onCancelApply, selectedCharId, loading }: Props) {
  const sorted = SLOT_ORDER.map((s) => slots.find((x) => x.slot === s)).filter(Boolean) as LobbyLoadoutSlot[];

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
      <h2 className="text-white font-semibold mb-4">Current Roll</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {SLOT_ORDER.map((slotName) => {
          const slot = sorted.find((s) => s.slot === slotName);
          return (
            <div
              key={slotName}
              className="flex flex-col items-center gap-2 bg-bungie-dark rounded-lg p-3 border border-bungie-border"
            >
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                {SLOT_LABELS[slotName]}
              </span>
              {slot && slot.item_hash === 0 ? (
                <>
                  <div className="w-14 h-14 rounded bg-purple-900/40 border border-purple-700/50 flex items-center justify-center text-2xl">
                    ❓
                  </div>
                  <div className="text-center">
                    <p className="text-purple-300 text-xs font-semibold">Your Choice</p>
                    <p className="text-gray-500 text-xs">Keep current weapon</p>
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
