import Link from "next/link";
import type { WeeklyChallenge, UserPlacement } from "@/types/platform";
import RuleChips from "./RuleChips";
import ResetCountdown from "./ResetCountdown";

// Weekly hero card (#243/#245/#251). Reads real challenge data (mock for now)
// and surfaces the four status numbers the roadmap wants front-and-center:
// reset countdown, run count, the user's best placement, and the run CTA.
//
// Also backs the PvP Weekly card (#296) via the accent/href/label/size props
// - no separate component, since the only differences are visual identity
// and a compact size for the dashboard's paired PvE+PvP layout.

type Accent = "blue" | "red";

const ACCENT = {
  blue: {
    text: "text-bungie-blue",
    borderL: "border-l-bungie-blue",
    button: "bg-bungie-blue hover:bg-[#26bcf3] text-white",
    rank: "text-bungie-blue",
  },
  red: {
    text: "text-red-400",
    borderL: "border-l-red-400",
    button: "bg-red-500 hover:bg-red-400 text-white",
    rank: "text-red-400",
  },
} as const;

function Stat({ label, compact, children }: { label: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-1">{label}</p>
      <p className={`font-bold text-white leading-none ${compact ? "text-sm" : "text-lg"}`}>{children}</p>
    </div>
  );
}

interface Props {
  challenge: WeeklyChallenge | null;
  placement: UserPlacement | null;
  runCount: number;
  /** Visual identity - PvE stays blue, PvP uses red (#296). */
  accent?: Accent;
  /** Run CTA target. */
  href?: string;
  /** Overrides the "Weekly Challenge" eyebrow, e.g. "PvE Weekly" / "PvP Weekly". */
  label?: string;
  /** "compact" drops the rule chips and shrinks padding/type scale for the
   * dashboard's paired PvE+PvP layout; "hero" (default) is the full-size
   * standalone card. */
  size?: "hero" | "compact";
}

export default function WeeklyHero({
  challenge,
  placement,
  runCount,
  accent = "blue",
  href = "/weekly",
  label = "Weekly Challenge",
  size = "hero",
}: Props) {
  const a = ACCENT[accent];
  const compact = size === "compact";

  // Clean fallback when no challenge is active (#251) - also covers a
  // genuinely-missing pillar (mid-migration, failed generation, no seed in
  // local dev) so a missing PvP week never crashes or shows an empty
  // leaderboard, just this same "no active week" state (#296).
  if (!challenge) {
    return (
      <section className={`panel border-l-2 border-l-bungie-border ${compact ? "p-4" : "p-6"}`}>
        <p className={`section-label text-gray-500 mb-2 ${compact ? "text-[10px]" : ""}`}>{label}</p>
        <h2 className={`font-bold uppercase tracking-tight text-white ${compact ? "text-base" : "text-2xl"}`}>
          No active week
        </h2>
        <p className="text-sm text-gray-400 mt-2">
          The next weekly challenge hasn&apos;t been published yet. Check back after reset.
        </p>
      </section>
    );
  }

  return (
    <section className={`panel border-l-2 ${a.borderL} ${compact ? "p-4" : "p-6"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`section-label ${a.text} mb-2 ${compact ? "text-[10px]" : ""}`}>
            {label} · Week {challenge.weekNumber}
          </p>
          <h2
            className={`font-bold uppercase tracking-tight text-white ${
              compact ? "text-lg" : "text-2xl md:text-3xl"
            }`}
          >
            {challenge.title}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{challenge.activityName}</p>
        </div>
        <Link
          href={href}
          className={`shrink-0 ${a.button} font-bold uppercase tracking-wider transition-colors ${
            compact ? "text-[11px] px-3 py-1.5" : "text-xs px-5 py-3"
          }`}
        >
          Run the Weekly
        </Link>
      </div>

      {!compact && (
        <div className="mt-4">
          <RuleChips rules={challenge.rules} />
        </div>
      )}

      <div
        className={`grid grid-cols-2 sm:grid-cols-3 gap-6 border-t border-bungie-border ${
          compact ? "mt-3 pt-3" : "mt-6 pt-4"
        }`}
      >
        <Stat label="Resets in" compact={compact}>
          <ResetCountdown endsAt={challenge.endsAt} />
        </Stat>
        <Stat label="Runs this week" compact={compact}>
          <span className="font-mono slashed-zero">{runCount.toLocaleString()}</span>
        </Stat>
        <Stat label="Your best" compact={compact}>
          {placement?.rank ? (
            <span className={`font-mono slashed-zero ${a.rank}`}>#{placement.rank}</span>
          ) : (
            <span className="text-sm font-normal text-gray-500">Not run yet</span>
          )}
        </Stat>
      </div>
    </section>
  );
}
