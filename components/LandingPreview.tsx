"use client";

import { Crown, Shuffle } from "lucide-react";
import type { HeroWeaponSample } from "@/lib/bungie/definitions";
import type { WeaponSlot } from "@/types/bungie";
import { damageTheme } from "./weaponShared";

// A static, non-interactive recreation of the real in-lobby Loadout panel
// (see LoadoutQueue.tsx), built from the same real weapon data as HeroReel.
// This exists to give the landing page an actual product visual instead of
// generic feature icons - matching the "show the real UI" pattern most
// dark-mode product landing pages use for their hero/below-the-fold section.
const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];

export default function LandingPreview({
  weaponsBySlot,
}: {
  weaponsBySlot: Record<WeaponSlot, HeroWeaponSample[]>;
}) {
  const weapons = SLOT_ORDER.map((slot) => weaponsBySlot[slot]?.[0]).filter(Boolean) as HeroWeaponSample[];
  if (weapons.length < 3) return null;

  return (
    <div className="w-full max-w-sm bg-bungie-surface border border-bungie-border/40 rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-bungie-border/40">
        <div className="flex items-center gap-2">
          <Crown size={14} className="text-bungie-blue" />
          <h3 className="text-white text-sm font-semibold">Loadout</h3>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-bungie-blue bg-bungie-blue/10 border border-bungie-blue/30 rounded-md px-2 py-1">
          <Shuffle size={12} />
          Roll All
        </span>
      </div>

      <div>
        {SLOT_ORDER.map((slotName, i) => {
          const weapon = weapons[i];
          const theme = damageTheme(weapon.damageType);
          return (
            <div
              key={slotName}
              className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-bungie-border/30" : ""}`}
            >
              <span className={`w-1 self-stretch rounded-full shrink-0 ${theme.fill}`} aria-hidden />
              <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-gray-500">{slotName}</span>
              <div className={`relative rounded-lg overflow-hidden border shrink-0 ${theme.bg} ${theme.border}`} style={{ width: 44, height: 44 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={weapon.icon} alt="" width={44} height={44} style={{ objectFit: "cover", display: "block" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold leading-tight truncate">{weapon.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {weapon.weaponType}
                  {weapon.damageType && <span className={theme.text}> · {weapon.damageType}</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
