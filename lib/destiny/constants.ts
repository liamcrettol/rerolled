import type { WeaponSlot } from "@/types/bungie";

export const BUNGIE_CDN = "https://www.bungie.net";

export const CLASS_NAMES: Readonly<Record<number, string>> = {
  0: "Titan",
  1: "Hunter",
  2: "Warlock",
};

export const SLOT_ORDER = ["kinetic", "energy", "power"] as const satisfies readonly WeaponSlot[];

export const SLOT_LABELS: Readonly<Record<WeaponSlot, string>> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

export const DAMAGE_COLORS: Readonly<Record<string, string>> = {
  Arc: "#7bd6ff",
  Solar: "#ff8a3d",
  Void: "#b58cff",
  Stasis: "#5b8dff",
  Strand: "#2fd66f",
  Kinetic: "#d3dae1",
};

export const RARITY_EDGE_COLORS = {
  exotic: "rgba(199, 166, 74, 0.9)",
  legendary: "rgba(120, 81, 145, 0.9)",
} as const;

export interface DamageTheme {
  text: string;
  border: string;
  ring: string;
  bg: string;
  fill: string;
  chip: string;
}

export const DAMAGE_THEMES: Readonly<Record<string, DamageTheme>> = {
  Kinetic: { text: "text-gray-200", border: "border-gray-400/60", ring: "ring-gray-400/40", bg: "bg-gray-400/10", fill: "bg-gray-300", chip: "bg-gray-400/20 border-gray-400/40 text-gray-200" },
  Solar: { text: "text-orange-400", border: "border-orange-500/70", ring: "ring-orange-500/40", bg: "bg-orange-500/10", fill: "bg-orange-400", chip: "bg-orange-500/20 border-orange-500/40 text-orange-300" },
  Arc: { text: "text-cyan-300", border: "border-cyan-400/70", ring: "ring-cyan-400/40", bg: "bg-cyan-400/10", fill: "bg-cyan-300", chip: "bg-cyan-400/20 border-cyan-400/40 text-cyan-200" },
  Void: { text: "text-purple-400", border: "border-purple-500/70", ring: "ring-purple-500/40", bg: "bg-purple-500/10", fill: "bg-purple-400", chip: "bg-purple-500/20 border-purple-500/40 text-purple-300" },
  Stasis: { text: "text-blue-400", border: "border-blue-500/70", ring: "ring-blue-500/40", bg: "bg-blue-500/10", fill: "bg-blue-400", chip: "bg-blue-500/20 border-blue-500/40 text-blue-300" },
  Strand: { text: "text-emerald-400", border: "border-emerald-500/70", ring: "ring-emerald-500/40", bg: "bg-emerald-500/10", fill: "bg-emerald-400", chip: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" },
};

export const DAMAGE_COLOR: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(DAMAGE_THEMES).map(([name, theme]) => [name, theme.text]),
);

export const DEFAULT_DAMAGE_THEME: DamageTheme = {
  text: "text-gray-300",
  border: "border-bungie-border",
  ring: "ring-bungie-blue/40",
  bg: "bg-bungie-dark",
  fill: "bg-bungie-blue",
  chip: "bg-bungie-blue/20 border-bungie-blue/40 text-blue-300",
};

export function damageColor(damageType?: string): string {
  return (damageType && DAMAGE_COLORS[damageType]) || "#9aa1a9";
}

export function damageTheme(damageType?: string): DamageTheme {
  return (damageType && DAMAGE_THEMES[damageType]) || DEFAULT_DAMAGE_THEME;
}

export function bungieImg(path?: string | null): string {
  if (!path) return "";
  return path.startsWith("http") ? path : `${BUNGIE_CDN}${path}`;
}
