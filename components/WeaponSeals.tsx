"use client";

import type { SealStatus } from "@/types/weapon";

interface Props {
  seals: SealStatus;
}

const SEAL_CONFIGS = {
  isInLoadout: {
    label: "✓ Loadout",
    title: "Currently equipped in your loadout",
    className: "bg-green-500/20 border border-green-500/40 text-green-400"
  },
  isInYourRoll: {
    label: "⚡ Your Roll",
    title: "In your current roulette roll",
    className: "bg-bungie-blue/20 border border-bungie-blue/40 text-blue-300"
  },
  isInFireteamRoll: {
    label: "👥 Team",
    title: "In a fireteam member's roll",
    className: "bg-purple-500/20 border border-purple-500/40 text-purple-300"
  }
} as const;

export default function WeaponSeals({ seals }: Props) {
  if (!seals.isInLoadout && !seals.isInYourRoll && !seals.isInFireteamRoll) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      {Object.entries(SEAL_CONFIGS).map(([key, config]) => {
        const sealKey = key as keyof typeof SEAL_CONFIGS;
        return seals[sealKey] ? (
          <span
            key={key}
            className={`text-[10px] rounded px-1.5 py-0.5 leading-none font-semibold ${config.className}`}
            title={config.title}
          >
            {config.label}
          </span>
        ) : null;
      })}
    </div>
  );
}
