"use client";

import Image from "next/image";
import { Crown, Check } from "lucide-react";
import { damageTheme } from "./weaponShared";
import type { HeroWeaponSample } from "@/lib/bungie/definitions";
import type { WeaponSlot } from "@/types/bungie";

const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];
const SLOT_LABELS: Record<WeaponSlot, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };
const MOCK_FIRETEAM = ["A", "B", "C"];

// Static mock of the active-lobby screen for the signed-out landing page, so a
// new visitor can see the actual product loop (shared pool, rolled loadout,
// fireteam) before being asked to sign in (#207). Not a live lobby - weapons
// are real sample data, everything else (code, members, round) is fake.
export default function LobbyPreview({
  weapons,
}: {
  weapons: Partial<Record<WeaponSlot, HeroWeaponSample>>;
}) {
  return (
    <div className="glass-card rounded-xl p-4 w-full max-w-sm text-left" aria-hidden="true">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-bungie-blue font-bold tracking-widest text-sm">ABC123</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-lg border border-yellow-500/60 bg-yellow-500/10 text-yellow-300 inline-flex items-center gap-1">
          <Crown size={11} />
          Round 2 · Your turn
        </span>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        {MOCK_FIRETEAM.map((initial) => (
          <div
            key={initial}
            className="w-6 h-6 rounded-full bg-bungie-border/60 flex items-center justify-center text-[10px] text-gray-300 font-semibold"
          >
            {initial}
          </div>
        ))}
        <span className="text-[10px] text-gray-500 ml-1">Shared loadout</span>
      </div>

      <div className="space-y-1.5">
        {SLOT_ORDER.map((slot) => {
          const w = weapons[slot];
          if (!w) return null;
          const theme = damageTheme(w.damageType);
          return (
            <div key={slot} className="flex items-center gap-2 rounded-lg bg-bungie-dark/40 p-1.5">
              <div className="relative w-8 h-8 shrink-0 rounded overflow-hidden bg-gray-800">
                <Image src={w.icon} alt="" fill className="object-cover" unoptimized />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-semibold truncate">{w.name}</p>
                <p className={`text-[10px] ${theme.text}`}>{SLOT_LABELS[slot]}</p>
              </div>
              <Check size={13} className="text-green-400 shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
