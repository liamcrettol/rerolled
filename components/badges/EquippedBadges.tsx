import BadgeChip, { type BadgeChipSize } from "@/components/badges/BadgeChip";
import type { DisplayBadge } from "@/lib/badges/data";
import { compareBadgePriority } from "@/lib/badges/style";

// Compact "featured badges" strip for profile/player-card surfaces (#297) —
// at most 3 chips, highest-priority first, with a "+N" overflow instead of
// unbounded growth. Priority = rarest tier first, then most recently earned,
// since a player card has no room to show everything the full Badge Case can.

interface Props {
  badges: DisplayBadge[];
  max?: number;
  size?: BadgeChipSize;
}

export default function EquippedBadges({ badges, max = 3, size = "tiny" }: Props) {
  if (badges.length === 0) return null;

  const ordered = [...badges].sort(compareBadgePriority);
  const shown = ordered.slice(0, max);
  const overflow = ordered.length - shown.length;

  return (
    <div className="flex items-center gap-1">
      {shown.map((b) => (
        <BadgeChip
          key={b.slug + b.earnedAt}
          slug={b.slug}
          name={b.name}
          description={b.description}
          tier={b.tier}
          mode={b.mode}
          iconKey={b.iconKey}
          size={size}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[10px] font-bold text-gray-300 px-0.5 drop-shadow" aria-label={`${overflow} more badges`}>
          +{overflow}
        </span>
      )}
    </div>
  );
}
