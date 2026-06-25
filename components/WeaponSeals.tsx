"use client";

import type { SealStatus } from "@/types/weapon";

interface Props {
  seals: SealStatus;
}

export default function WeaponSeals({ seals }: Props) {
  if (!seals.isInLoadout && !seals.isInYourRoll && !seals.isInFireteamRoll) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      {seals.isInLoadout && (
        <span
          className="text-[10px] bg-green-500/20 border border-green-500/40 text-green-400 rounded px-1.5 py-0.5 leading-none font-semibold"
          title="Currently equipped in your loadout"
        >
          ✓ Loadout
        </span>
      )}
      {seals.isInYourRoll && (
        <span
          className="text-[10px] bg-bungie-blue/20 border border-bungie-blue/40 text-blue-300 rounded px-1.5 py-0.5 leading-none font-semibold"
          title="In your current roulette roll"
        >
          ⚡ Your Roll
        </span>
      )}
      {seals.isInFireteamRoll && (
        <span
          className="text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded px-1.5 py-0.5 leading-none font-semibold"
          title="In a fireteam member's roll"
        >
          👥 Team
        </span>
      )}
    </div>
  );
}
