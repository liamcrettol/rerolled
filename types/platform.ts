// Platform types for Rerolled's fireteam game modes.

/** Every play mode the platform knows about (#244). */
export type ModeId = "gun_roulette" | "draft";

/** Status badge shown on a mode card. */
export type ModeStatus = "live" | "new" | "soon";

/**
 * Per-mode accent color (#244). Each activity gets its own visual identity so
 * the hub reads as distinct game modes, not one grid of identical cards. Maps
 * to static Tailwind class sets in the components that render modes.
 */
export type ModeAccent = "blue" | "amber" | "green" | "purple" | "red";

/**
 * A mode's display + launch metadata (#244). Cards on the home grid are driven
 * entirely by these records so the homepage never accumulates one-off card
 * conditionals.
 */
export interface ModeDefinition {
  id: ModeId;
  title: string;
  eyebrow: string;
  /** One-sentence pitch shown under the title. */
  description: string;
  status: ModeStatus;
  enabled: boolean;
  /**
   * Where selecting the card takes the user. `null` for disabled roadmap modes
   * (#253) that must not start a flow.
   */
  href: string | null;
  ctaLabel: string;
  /** The mode's accent color — its visual identity across the hub. */
  accent: ModeAccent;
}
