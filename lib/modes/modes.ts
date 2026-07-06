// Mode registry (#244).
//
// The home mode grid (#243) and mode routing are driven by this single config
// instead of duplicated, hard-coded card data. Adding rulesets/scoring to a
// mode later means extending a record here, not rewriting the homepage.
//
// Roadmap status per #237:
//   - gun_roulette   → live PvP loadout roulette, routes into the existing lobby flow
//   - score_attack   → new, live solo run flow (roll → equip → auto-score)
//   - weekly_challenge → surfaced via the hero, not the grid; run flow on /weekly
//   - draft / ironman → disabled roadmap cards until Weekly v1 ships (#253)
//
// Each mode also carries an `accent` — its color identity across the hub
// (mode cards, run flow, page headers) so every activity has a distinct UI.

import type { ModeDefinition, ModeId } from "@/types/platform";

export const MODES: Record<ModeId, ModeDefinition> = {
  gun_roulette: {
    id: "gun_roulette",
    title: "PvP Loadout Roulette",
    eyebrow: "Fireteam PvP",
    description: "Create a Crucible lobby, tune the roll rules, and make everyone fight with the same chaos.",
    status: "live",
    enabled: true,
    href: "/lobby/new",
    ctaLabel: "Create PvP Lobby",
    accent: "green",
  },
  score_attack: {
    id: "score_attack",
    title: "Score Attack",
    eyebrow: "Solo PvE",
    description: "Roll a loadout, run a PvE activity, and score the clear.",
    status: "new",
    enabled: true,
    href: "/score-attack",
    ctaLabel: "Start Solo Run",
    accent: "amber",
  },
  weekly_challenge: {
    id: "weekly_challenge",
    title: "Weekly Challenge",
    eyebrow: "Global PvE",
    description: "One global ruleset, one activity, one site-wide leaderboard.",
    status: "new",
    enabled: true,
    // Launched from the hero CTA; kept in the registry so routing/metadata
    // has a single source of truth.
    href: "/weekly",
    ctaLabel: "Run Weekly",
    accent: "blue",
  },
  draft: {
    id: "draft",
    title: "Draft",
    eyebrow: "Fireteam PvP",
    description: "Your fireteam picks and bans each other's guns.",
    status: "soon",
    enabled: false,
    href: null,
    ctaLabel: "Coming Soon",
    accent: "purple",
  },
  ironman: {
    id: "ironman",
    title: "Ironman",
    eyebrow: "Endurance",
    description: "Every death forces a reroll — survive the loadout.",
    status: "soon",
    enabled: false,
    href: null,
    ctaLabel: "Coming Soon",
    accent: "red",
  },
};

/** The cards shown in the home mode grid, in display order (#243). */
export const HOME_MODE_GRID: ModeDefinition[] = [
  MODES.gun_roulette,
  MODES.score_attack,
  MODES.draft,
  MODES.ironman,
];

export function getMode(id: ModeId): ModeDefinition {
  return MODES[id];
}
