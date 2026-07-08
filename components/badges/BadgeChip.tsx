import BadgeIcon from "@/components/badges/BadgeIcon";
import { BESPOKE_BADGES } from "@/components/badges/bespoke";
import { TIER_ACCENT, MODE_ACCENT } from "@/lib/badges/style";
import type { BadgeMode, BadgeTier } from "@/types/badges";

// The shared badge chip frame (#297) — one flat rectangular frame (zero
// border radius, per the app's hard-edge design system) with icon zone +
// label zone + a tier accent rail, standardized to three fixed sizes. Every
// badge surface (shelf, equipped strip, case tile) composes this instead of
// hand-rolling its own pill markup.

export type BadgeChipSize = "full" | "compact" | "tiny" | "icon";

const SIZE_CLS: Record<BadgeChipSize, { box: string; icon: number; text: string }> = {
  full: { box: "h-12 w-40", icon: 22, text: "text-xs" },
  compact: { box: "h-9 w-[7.5rem]", icon: 18, text: "text-[11px]" },
  tiny: { box: "h-7 w-24", icon: 14, text: "text-[10px]" },
  // Square, no visible label — for tight corner placement (e.g. the player
  // card nameplate). The name/description still reach screen readers via
  // the sr-only span below; this is never a bare decorative icon.
  icon: { box: "h-6 w-6", icon: 14, text: "text-[10px]" },
};

interface Props {
  /** Stable badge identifier — looked up in the bespoke-art registry
   * (components/badges/bespoke) before falling back to the generic frame. */
  slug: string;
  name: string;
  description: string;
  tier: BadgeTier;
  mode: BadgeMode | null;
  iconKey: string | null;
  size?: BadgeChipSize;
  /** Unearned Badge Case tile — dimmed, gray, no tier/mode color. */
  locked?: boolean;
  className?: string;
}

export default function BadgeChip({
  slug,
  name,
  description,
  tier,
  mode,
  iconKey,
  size = "compact",
  locked = false,
  className = "",
}: Props) {
  const s = SIZE_CLS[size];
  const iconOnly = size === "icon";
  const tierColor = locked ? "#4b5158" : TIER_ACCENT[tier];
  const modeColor = mode ? MODE_ACCENT[mode] : null;
  const srText = locked ? `Not yet earned. ${description}` : `${name}. ${description}`;

  // Bespoke art is hand-drawn at the full 160x48 viewBox — only viable at
  // BadgeChip's "full" size. Every other size falls back to the generic
  // motif frame below, even for a slug with a bespoke entry.
  const Bespoke = size === "full" ? BESPOKE_BADGES[slug] : undefined;
  if (Bespoke) {
    return (
      <div
        title={description}
        className={`relative ${s.box} ${locked ? "opacity-45 grayscale" : ""} ${className}`}
      >
        <Bespoke />
        <span className="sr-only">{srText}</span>
      </div>
    );
  }

  return (
    <div
      title={description}
      className={`group relative flex items-stretch bg-bungie-surface border border-bungie-border ${s.box} ${
        locked ? "opacity-45 grayscale" : ""
      } ${className}`}
      style={{ borderLeftWidth: 2, borderLeftColor: tierColor }}
    >
      <div
        className={`flex items-center justify-center shrink-0 ${iconOnly ? "flex-1" : "px-2"}`}
        style={{ color: tierColor }}
      >
        <BadgeIcon iconKey={iconKey} size={s.icon} />
      </div>
      {iconOnly ? (
        <span className="sr-only">{srText}</span>
      ) : (
        <div className="flex-1 min-w-0 flex flex-col justify-center pr-2 py-1">
          <span className={`font-bold uppercase tracking-wide text-white truncate ${s.text}`}>
            {name}
          </span>
          {/* Screen readers get the description unconditionally — the title
              attribute (hover-only tooltip) is never the sole source (#297
              accessibility requirement). */}
          <span className="sr-only">{locked ? `Not yet earned. ${description}` : description}</span>
        </div>
      )}
      {modeColor && (
        <span
          aria-hidden="true"
          className={`absolute ${iconOnly ? "bottom-0 right-0 w-1 h-1" : "top-1 right-1 w-1.5 h-1.5"}`}
          style={{ backgroundColor: modeColor }}
        />
      )}
    </div>
  );
}
