import { Dices, Swords, Skull } from "lucide-react";
import type { ModeAccent, ModeId } from "@/types/platform";

// Shared per-mode presentation (icon + accent color classes), split out of
// ModeGrid.tsx so any other surface that renders modes (e.g. the signed-out
// landing spotlight) draws from the same source instead of re-declaring these
// Tailwind-can't-see-dynamic-classes lookup tables.

export const MODE_ICONS: Record<ModeId, typeof Dices> = {
  gun_roulette: Dices,
  draft: Swords,
  ironman: Skull,
};

export const ACCENT_CLS: Record<
  ModeAccent,
  { border: string; icon: string; hover: string; action: string }
> = {
  green: { border: "border-l-green-400", icon: "text-green-400", hover: "hover:border-green-400", action: "text-green-300" },
  amber: { border: "border-l-amber-400", icon: "text-amber-400", hover: "hover:border-amber-400", action: "text-amber-300" },
  blue: { border: "border-l-bungie-blue", icon: "text-bungie-blue", hover: "hover:border-bungie-blue", action: "text-bungie-blue" },
  purple: { border: "border-l-purple-400", icon: "text-purple-400", hover: "hover:border-purple-400", action: "text-purple-300" },
  red: { border: "border-l-red-400", icon: "text-red-400", hover: "hover:border-red-400", action: "text-red-300" },
};

// Rarity-edge-style glow per accent (same rgba box-shadow-edge vocabulary as
// HeroReel's exotic/legendary tile glow), used to spotlight the active mode
// card without inventing a new visual language.
export const ACCENT_GLOW: Record<ModeAccent, string> = {
  green: "rgba(74, 222, 128, 0.55)",
  amber: "rgba(251, 191, 36, 0.55)",
  blue: "rgba(0, 174, 239, 0.55)",
  purple: "rgba(192, 132, 252, 0.55)",
  red: "rgba(248, 113, 113, 0.55)",
};
