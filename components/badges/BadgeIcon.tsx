import { motifForIconKey } from "@/lib/badges/assets";

// The shared motif glyph for the badge icon zone (#297). One thin-line vector
// per motif, not a bespoke illustration per badge — color comes from
// `currentColor` (set by the parent via inline style/tier accent) so this
// stays a single flat-line glyph, consistent with the app's zero-gradient,
// zero-3D design system. Purely decorative: BadgeChip supplies the
// accessible name/description, so this is always aria-hidden.
//
// Be aware of what this costs: migration 043 assigns icon_key by *category*,
// and the biggest categories hold 15 and 14 badges. So every completion badge
// draws the same laurel and every performance badge the same ring, separated
// only by a 2px tier border that is invisible at 24px. Two badges on a player
// card routinely render as the same glyph twice. That is why the strip alone
// reads as generic, and why the hover popover (BadgePopover) carries the name
// and description — it's the only thing telling badges apart on that surface.

interface Props {
  iconKey: string | null;
  size?: number;
  className?: string;
}

export default function BadgeIcon({ iconKey, size = 20, className = "" }: Props) {
  const motif = motifForIconKey(iconKey);
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={className}
    >
      {motif === "laurel" && (
        <>
          <path d="M11 8 L16 24 L21 8" />
          <path d="M11 8 L9 12 M11 8 L13.5 9.5" />
          <path d="M21 8 L23 12 M21 8 L18.5 9.5" />
        </>
      )}
      {motif === "ring" && (
        <>
          <circle cx="16" cy="16" r="9" />
          <path d="M16 7 L16 4" />
        </>
      )}
      {motif === "corner-cut" && (
        <path d="M11 6 H21 L26 11 V21 L21 26 H11 L6 21 V11 Z" />
      )}
      {motif === "sigil" && (
        <>
          <path d="M16 5 L27 16 L16 27 L5 16 Z" />
          <circle cx="16" cy="16" r="2" fill="currentColor" stroke="none" />
        </>
      )}
      {motif === "rail" && (
        <>
          <path d="M9 22 V16" />
          <path d="M16 22 V10" />
          <path d="M23 22 V13" />
        </>
      )}
      {motif === "status" && (
        <path d="M16 5 V27 M6 16 H26 M9 9 L23 23 M23 9 L9 23" />
      )}
    </svg>
  );
}
