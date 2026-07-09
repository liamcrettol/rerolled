// Shared tier/mode display tokens for the badge component system (#297).
// Kept framework-agnostic (no JSX) so both server and client badge code can
// import it without pulling in React.

import type { BadgeMode, BadgeTier } from "@/types/badges";

// Same tier palette the old text-pill BadgeShelf used (components/platform/
// BadgeShelf.tsx) — kept for continuity, now applied to a border/accent
// treatment instead of the whole label's text color.
export const TIER_ACCENT: Record<BadgeTier, string> = {
  bronze: "#b45309",
  silver: "#c7ccd1",
  gold: "#facc15",
  platinum: "#67e8f9",
  special: "#00aeef",
};

// A muted per-mode accent — a thin rail/dot, never a glow (design system:
// color is semantic, never decorative). Distinct from Destiny element/rarity
// colors so badges don't compete visually with weapon cards.
export const MODE_ACCENT: Record<BadgeMode, string> = {
  core: "#8b93a1",
  crucible: "#f87171",
  trials: "#a78bfa",
  iron_banner: "#fb923c",
  pve: "#4ade80",
  status_legacy: "#00aeef",
};

export const MODE_LABEL: Record<BadgeMode, string> = {
  core: "Core",
  crucible: "Crucible",
  trials: "Trials",
  iron_banner: "Iron Banner",
  pve: "PvE",
  status_legacy: "Status",
};

// Display order for Badge Case mode tabs/groups.
export const MODE_ORDER: BadgeMode[] = ["core", "crucible", "trials", "iron_banner", "pve", "status_legacy"];

const TIER_RANK: Record<BadgeTier, number> = {
  special: 4,
  platinum: 3,
  gold: 2,
  silver: 1,
  bronze: 0,
};

// Rarest tier first, then most recently earned. The equipped strip shows only
// the first 2-3 of these while the hover popover lists all of them, so both
// have to agree on the order or the strip reads as an arbitrary sample of the
// popover. Takes a structural param rather than DisplayBadge so this module
// stays free of the server-side badge data layer.
export function compareBadgePriority(
  a: { tier: BadgeTier; earnedAt: string },
  b: { tier: BadgeTier; earnedAt: string }
): number {
  const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
  if (tierDiff !== 0) return tierDiff;
  return new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime();
}
