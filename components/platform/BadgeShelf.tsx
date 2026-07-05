import type { EarnedBadge } from "@/lib/badges/data";
import type { BadgeTier } from "@/types/badges";

// Badge display shelf (#257). Persistent identity layer shown on the profile /
// season view — earned badges as flat tier-tinted pills, with a clean empty
// state for players who haven't earned any yet.

const TIER_CLS: Record<BadgeTier, string> = {
  bronze: "text-amber-600 border-amber-600/40",
  silver: "text-gray-300 border-gray-400/40",
  gold: "text-yellow-400 border-yellow-400/40",
  platinum: "text-cyan-300 border-cyan-300/40",
  special: "text-bungie-blue border-bungie-blue/40",
};

export default function BadgeShelf({ badges }: { badges: EarnedBadge[] }) {
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
              <span
                key={b.slug + b.earnedAt}
                title={b.description}
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 border ${TIER_CLS[b.tier]}`}
              >
                {b.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
