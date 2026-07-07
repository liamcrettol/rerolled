// Badge visual asset/catalog layer (#297).
//
// Badge art is a single shared frame with controlled variants — not a
// bespoke illustration per badge (48+ badges, one motif each would be a
// full-time art job and would drift visually). `icon_key` (backfilled by
// migration 043) selects one of a handful of vector motifs; tier and mode
// drive color, not shape. This is a parametric renderer, not a static asset
// pipeline — there is no /public/badges/*.svg per badge, the "asset" is the
// motif + version pairing below, rendered live by BadgeIcon.

export type BadgeMotif = "laurel" | "corner-cut" | "ring" | "sigil" | "rail" | "status";

export const DEFAULT_MOTIF: BadgeMotif = "ring";

// icon_key -> motif. Bump BADGE_ASSET_VERSION (not the map) when the motif
// paths themselves change shape, so any future cache keyed on version alone
// still busts correctly without touching every row's icon_key.
const MOTIF_BY_ICON_KEY: Record<string, BadgeMotif> = {
  laurel: "laurel",
  "corner-cut": "corner-cut",
  ring: "ring",
  sigil: "sigil",
  rail: "rail",
  status: "status",
};

export function motifForIconKey(iconKey: string | null | undefined): BadgeMotif {
  if (!iconKey) return DEFAULT_MOTIF;
  return MOTIF_BY_ICON_KEY[iconKey] ?? DEFAULT_MOTIF;
}

// Bumped when BadgeIcon's motif paths change shape (not per-badge — the
// motifs are shared), so anything caching by this version stays correct.
export const BADGE_ASSET_VERSION = 1;
