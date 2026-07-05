// Mode registry (#244).
//
// The home mode grid (#243) and mode routing are driven by this single config
// instead of duplicated, hard-coded card data. Adding rulesets/scoring to a
// mode later means extending a record here, not rewriting the homepage.
//
// Roadmap status per #237:
//   - gun_roulette   → live today, routes into the existing lobby flow
//   - score_attack   → new, routes to a placeholder start screen for now (#246)
//   - weekly_challenge → surfaced via the hero, not the grid; run flow is #252
//   - draft / ironman → disabled roadmap cards until Weekly v1 ships (#253)

import type { ModeDefinition, ModeId } from "@/types/platform";

export const MODES: Record<ModeId, ModeDefinition> = {
  gun_roulette: {
    id: "gun_roulette",
    title: "Gun Roulette",
    description: "Roll a random loadout for your fireteam, then equip it together.",
    status: "live",
    enabled: true,
    // Reuses the existing, working lobby-creation flow.
    href: "/lobby/new",
  },
  score_attack: {
    id: "score_attack",
    title: "Score Attack",
    description: "Roll a loadout, run a PvE activity, and score the clear.",
    status: "new",
    enabled: true,
    // Placeholder start screen until the run lifecycle (#246) lands.
    href: "/score-attack",
  },
  weekly_challenge: {
    id: "weekly_challenge",
    title: "Weekly Challenge",
    description: "One global ruleset, one activity, one site-wide leaderboard.",
    status: "new",
    enabled: true,
    // Launched from the hero CTA; kept in the registry so routing/metadata
    // has a single source of truth.
    href: "/weekly",
  },
  draft: {
    id: "draft",
    title: "Draft",
    description: "Your fireteam picks and bans each other's guns.",
    status: "soon",
    enabled: false,
    href: null,
  },
  ironman: {
    id: "ironman",
    title: "Ironman",
    description: "Every death forces a reroll — survive the loadout.",
    status: "soon",
    enabled: false,
    href: null,
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
