import BadgeChip, { type BadgeChipSize } from "@/components/badges/BadgeChip";
import type { DisplayBadge } from "@/lib/badges/data";
import type { BadgeTier } from "@/types/badges";

// Compact "featured badges" strip for profile/player-card surfaces (#297) —
// at most 3 chips, highest-priority first, with a "+N" overflow instead of
// unbounded growth. Priority = rarest tier first, then most recently earned,
// since a player card has no room to show everything the full Badge Case can.

const TIER_RANK: Record<BadgeTier, number> = {
  special: 4,
  platinum: 3,
  gold: 2,
  silver: 1,
  bronze: 0,
};

function byPriority(a: DisplayBadge, b: DisplayBadge): number {
  const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
  if (tierDiff !== 0) return tierDiff;
  return new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime();
}

interface Props {
  badges: DisplayBadge[];
  max?: number;
  size?: BadgeChipSize;
}

export default function EquippedBadges({ badges, max = 3, size = "tiny" }: Props) {
  if (badges.length === 0) return null;

  const ordered = [...badges].sort(byPriority);
  const shown = ordered.slice(0, max);
  const overflow = ordered.length - shown.length;

  return (
    <div className="flex items-center gap-1">
      {shown.map((b) => (
        <BadgeChip
          key={b.slug + b.earnedAt}
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
