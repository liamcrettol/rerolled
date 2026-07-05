import Link from "next/link";
import type { WeeklyChallenge, UserPlacement } from "@/types/platform";
import RuleChips from "./RuleChips";
import ResetCountdown from "./ResetCountdown";

// Weekly hero card (#243/#245/#251). Reads real challenge data (mock for now)
// and surfaces the four status numbers the roadmap wants front-and-center:
// reset countdown, run count, the user's best placement, and the run CTA.

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-1">{label}</p>
      <p className="text-lg font-bold text-white leading-none">{children}</p>
    </div>
  );
}

interface Props {
  challenge: WeeklyChallenge | null;
  placement: UserPlacement | null;
  runCount: number;
}

export default function WeeklyHero({ challenge, placement, runCount }: Props) {
  // Clean fallback when no challenge is active (#251).
  if (!challenge) {
    return (
      <section className="panel border-l-2 border-l-bungie-border p-6">
        <p className="section-label text-gray-500 mb-2">Weekly Challenge</p>
        <h2 className="text-2xl font-bold uppercase tracking-tight text-white">No active week</h2>
        <p className="text-sm text-gray-400 mt-2">
          The next weekly challenge hasn&apos;t been published yet. Check back after reset.
        </p>
      </section>
    );
  }

  return (
    <section className="panel border-l-2 border-l-bungie-blue p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="section-label text-bungie-blue mb-2">
            Weekly Challenge · Week {challenge.weekNumber}
          </p>
          <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-white">
            {challenge.title}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{challenge.activityName}</p>
        </div>
        <Link
          href="/weekly"
          className="shrink-0 bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
        >
          Run the Weekly
        </Link>
      </div>

      <div className="mt-4">
        <RuleChips rules={challenge.rules} />
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-6 border-t border-bungie-border pt-4">
        <Stat label="Resets in">
          <ResetCountdown endsAt={challenge.endsAt} />
        </Stat>
        <Stat label="Runs this week">
          <span className="font-mono slashed-zero">{runCount.toLocaleString()}</span>
        </Stat>
        <Stat label="Your best">
          {placement?.rank ? (
            <span className="font-mono slashed-zero text-bungie-blue">#{placement.rank}</span>
          ) : (
            <span className="text-sm font-normal text-gray-500">Not run yet</span>
          )}
        </Stat>
      </div>
    </section>
  );
}
