import type { CrucibleModeBucket } from "./types";

// DestinyActivityModeType values from Bungie's platform schema. Broad playlist
// markers are checked before individual rules because a PGCR can expose both.
const MODE = {
  CONTROL: 10,
  IRON_BANNER: 19,
  SURVIVAL: 37,
  COUNTDOWN: 38,
  IRON_BANNER_CONTROL: 43,
  IRON_BANNER_CLASH: 44,
  IRON_BANNER_SUPREMACY: 45,
  SHOWDOWN: 59,
  LOCKDOWN: 60,
  BREAKTHROUGH: 65,
  IRON_BANNER_SALVAGE: 68,
  PVP_COMPETITIVE: 69,
  CONTROL_QUICKPLAY: 73,
  CONTROL_COMPETITIVE: 74,
  ELIMINATION: 80,
  TRIALS_OF_OSIRIS: 84,
  RIFT: 88,
  ZONE_CONTROL: 89,
  IRON_BANNER_RIFT: 90,
  IRON_BANNER_ZONE_CONTROL: 91,
  COLLISION: 93,
} as const;

const IRON_BANNER_MODES = new Set<number>([
  MODE.IRON_BANNER,
  MODE.IRON_BANNER_CONTROL,
  MODE.IRON_BANNER_CLASH,
  MODE.IRON_BANNER_SUPREMACY,
  MODE.IRON_BANNER_SALVAGE,
  MODE.IRON_BANNER_RIFT,
  MODE.IRON_BANNER_ZONE_CONTROL,
]);

const COMPETITIVE_MODES = new Set<number>([
  MODE.PVP_COMPETITIVE,
  MODE.SURVIVAL,
  MODE.COUNTDOWN,
  MODE.SHOWDOWN,
  MODE.LOCKDOWN,
  MODE.BREAKTHROUGH,
  MODE.CONTROL_COMPETITIVE,
  MODE.ELIMINATION,
  MODE.RIFT,
  MODE.COLLISION,
]);

const CONTROL_MODES = new Set<number>([
  MODE.CONTROL,
  MODE.CONTROL_QUICKPLAY,
  MODE.ZONE_CONTROL,
]);

export function classifyCrucibleMode(input: {
  activityMode: number | null;
  activityModes: number[];
  activityHash: number | null;
  activityName?: string | null;
}): CrucibleModeBucket {
  const modes = new Set(input.activityModes);
  if (input.activityMode !== null) modes.add(input.activityMode);

  if (modes.has(MODE.TRIALS_OF_OSIRIS)) return "trials";
  if ([...modes].some((mode) => IRON_BANNER_MODES.has(mode))) return "iron_banner";
  if ([...modes].some((mode) => COMPETITIVE_MODES.has(mode))) return "competitive";
  if ([...modes].some((mode) => CONTROL_MODES.has(mode))) return "control";

  const name = input.activityName?.toLowerCase() ?? "";
  if (name.includes("trials of osiris")) return "trials";
  if (name.includes("iron banner")) return "iron_banner";
  return "other";
}

export function crucibleModeLabel(mode: CrucibleModeBucket): string {
  if (mode === "iron_banner") return "Iron Banner";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

