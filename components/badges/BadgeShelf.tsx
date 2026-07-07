import BadgeChip from "@/components/badges/BadgeChip";
import type { DisplayBadge } from "@/lib/badges/data";

// Profile/stats badge shelf (#257, rebuilt on the chip system #297) — every
// badge the player has earned, as real badge chips instead of plain-text
// tier-tinted pills.

export default function BadgeShelf({ badges }: { badges: DisplayBadge[] }) {
  return (
    <section>
      <p className="section-label mb-3">Badges</p>
      <div className="panel p-4">
        {badges.length === 0 ? (
          <p className="text-sm text-gray-500 py-2 text-center">
            No badges yet. Clear weekly challenges to start earning them.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <BadgeChip
                key={b.slug + b.earnedAt}
                name={b.name}
                description={b.description}
                tier={b.tier}
                mode={b.mode}
                iconKey={b.iconKey}
                size="compact"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
