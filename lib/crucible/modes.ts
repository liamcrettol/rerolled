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
  CLASH_COMPETITIVE: 72,
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

// The Competitive playlist rotates game modes (Zone Control, Clash, Survival,
// Rift, etc.), so those competitive variants classify as Competitive even when a
// broad "competitive" marker is absent. Zone Control (89) is a competitive-only
// mode; plain Control/Clash quickplay stay in their own buckets.
const COMPETITIVE_MODES = new Set<number>([
  MODE.PVP_COMPETITIVE,
  MODE.SURVIVAL,
  MODE.COUNTDOWN,
  MODE.SHOWDOWN,
  MODE.LOCKDOWN,
  MODE.BREAKTHROUGH,
  MODE.CLASH_COMPETITIVE,
  MODE.CONTROL_COMPETITIVE,
  MODE.ELIMINATION,
  MODE.RIFT,
  MODE.ZONE_CONTROL,
  MODE.COLLISION,
]);

const CONTROL_MODES = new Set<number>([
  MODE.CONTROL,
  MODE.CONTROL_QUICKPLAY,
]);

export function classifyCrucibleMode(input: {
  activityMode: number | null;
  activityModes: number[];
  activityHash: number | null;
  activityName?: string | null;
  directorActivityName?: string | null;
}): CrucibleModeBucket {
  const modes = new Set(input.activityModes);
  if (input.activityMode !== null) modes.add(input.activityMode);
  const name = input.activityName?.toLowerCase() ?? "";
  const directorName = input.directorActivityName?.toLowerCase() ?? "";

  if (modes.has(MODE.TRIALS_OF_OSIRIS)) return "trials";
  if ([...modes].some((mode) => IRON_BANNER_MODES.has(mode))) return "iron_banner";
  if (directorName.includes("trials of osiris")) return "trials";
  if (directorName.includes("iron banner")) return "iron_banner";
  if (directorName.includes("competitive")) return "competitive";
  if ([...modes].some((mode) => COMPETITIVE_MODES.has(mode))) return "competitive";
  if ([...modes].some((mode) => CONTROL_MODES.has(mode))) return "control";

  if (name.includes("trials of osiris")) return "trials";
  if (name.includes("iron banner")) return "iron_banner";
  return "other";
}

export function crucibleModeLabel(mode: CrucibleModeBucket): string {
  if (mode === "iron_banner") return "Iron Banner";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export function crucibleGameReportUrl(
  instanceId: string,
  mode: CrucibleModeBucket | null | undefined,
): string {
  const host = mode === "trials" ? "trials.report" : "crucible.report";
  return `https://${host}/pgcr/${encodeURIComponent(instanceId)}`;
}

// Specific game-type names for the match card, so a match reads "Clash" or
// "Rumble" instead of the coarse "Other" bucket. Playlist markers (Trials, Iron
// Banner, Competitive) win first; otherwise we name the specific game type from
// the singular activityMode.
const MODE_NAMES: Record<number, string> = {
  10: "Control", 12: "Clash", 25: "Mayhem", 31: "Supremacy", 37: "Survival",
  38: "Countdown", 48: "Rumble", 49: "Mayhem", 59: "Showdown", 60: "Lockdown",
  65: "Breakthrough", 70: "Quickplay", 71: "Clash", 72: "Clash", 73: "Control",
  74: "Control", 75: "Doubles", 80: "Elimination", 81: "Momentum", 84: "Trials of Osiris",
  88: "Rift", 89: "Zone Control", 93: "Collision", 94: "Relic",
};

export function crucibleModeName(input: {
  activityMode: number | null;
  activityModes: number[];
  modeBucket?: CrucibleModeBucket | null;
}): string {
  const modes = new Set(input.activityModes);
  if (input.activityMode !== null) modes.add(input.activityMode);
  if (modes.has(MODE.TRIALS_OF_OSIRIS)) return "Trials of Osiris";
  if ([...modes].some((m) => IRON_BANNER_MODES.has(m))) return "Iron Banner";
  // Prefer the specific game type from the singular mode, then the array.
  const specificMode = input.activityMode !== null && MODE_NAMES[input.activityMode]
    ? MODE_NAMES[input.activityMode]
    : input.activityModes.map((mode) => MODE_NAMES[mode]).find(Boolean);
  if (input.modeBucket === "competitive" || [...modes].some((m) => COMPETITIVE_MODES.has(m))) {
    return specificMode ? `Competitive ${specificMode}` : "Competitive";
  }
  if (specificMode) return specificMode;
  return "Crucible";
}
