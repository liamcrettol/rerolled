// Mode registry (#244).
//
// The home mode grid (#243) and mode routing are driven by this single config
// instead of duplicated, hard-coded card data. Adding rulesets/scoring to a
// mode later means extending a record here, not rewriting the homepage.
//
// Roadmap status per #237:
//   - gun_roulette   → live PvP loadout roulette, routes into the existing lobby flow
//   - draft → shared 1-of-3 card-reveal run flow on /draft (#266)
//   - ironman → repurposed into the live endgame PvE randomizer
// Score Attack and Weekly Challenge were removed (#342); their worker/stats
// substrate stays dormant under lib/scoreAttack, lib/challenges, lib/weekly.
//
// Each mode also carries an `accent` — its color identity across the hub
// (mode cards, run flow, page headers) so every activity has a distinct UI.

import type { ModeDefinition, ModeId } from "@/types/platform";

export const MODES: Record<ModeId, ModeDefinition> = {
  gun_roulette: {
    id: "gun_roulette",
    title: "Loadout Roulette",
    eyebrow: "Fireteam",
    description: "Create a shared loadout lobby for Crucible.",
    status: "live",
    enabled: true,
    href: "/lobby/new",
    ctaLabel: "Create Lobby",
    accent: "green",
  },
  draft: {
    id: "draft",
    title: "Draft",
    eyebrow: "Fireteam",
    description: "Choose 1 of 3 for each slot.",
    status: "live",
    enabled: true,
    href: "/draft/new/create",
    ctaLabel: "Start Draft",
    accent: "purple",
  },
  ironman: {
    id: "ironman",
    title: "Endgame Roulette",
    eyebrow: "PvE",
    description: "Roll a raid, dungeon, or Grandmaster loadout.",
    status: "live",
    enabled: true,
    href: "/endgame",
    ctaLabel: "Roll Endgame",
    accent: "red",
  },
};

/** The cards shown in the home mode grid, in display order (#243). Score
 * Attack was removed from the grid (#295); Endgame Roulette took its slot. */
export const HOME_MODE_GRID: ModeDefinition[] = [
  MODES.gun_roulette,
  MODES.ironman,
  MODES.draft,
];

export function getMode(id: ModeId): ModeDefinition {
  return MODES[id];
}
