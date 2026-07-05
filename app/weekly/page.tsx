import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import PlatformShell from "@/components/platform/PlatformShell";
import RuleChips from "@/components/platform/RuleChips";
import ResetCountdown from "@/components/platform/ResetCountdown";
import StandingsPreview from "@/components/platform/StandingsPreview";
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";
import { getStandingsPreview } from "@/lib/weekly/leaderboard";

// Weekly Challenge detail + run-start placeholder (#243/#252).
// The "Run the Weekly" CTA is intentionally inert for this skeleton pass — the
// Score Attack run lifecycle (#246) and end-to-end vertical slice (#252) wire up
// the actual roll/apply/detect/score loop later.
export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const challenge = await getActiveWeeklyChallenge();
  const standings = challenge ? await getStandingsPreview(challenge.id, session.userId) : [];

  if (!challenge) {
    return (
      <PlatformShell displayName={session.displayName}>
        <p className="section-label mb-2">Weekly Challenge</p>
        <h1 className="text-2xl font-bold uppercase tracking-tight text-white">No active week</h1>
        <p className="text-sm text-gray-400 mt-2">The next challenge hasn&apos;t been published yet.</p>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="space-y-8">
        <section className="panel border-l-2 border-l-bungie-blue p-6">
          <p className="section-label text-bungie-blue mb-2">
            Week {challenge.weekNumber} · {challenge.activityName}
          </p>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-white">{challenge.title}</h1>

          <div className="mt-4">
            <RuleChips rules={challenge.rules} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-6">
            <div>
              <p className="section-label mb-1">Resets in</p>
              <p className="text-lg font-bold"><ResetCountdown endsAt={challenge.endsAt} /></p>
            </div>
            <button
              type="button"
              disabled
              title="Run flow ships with the Weekly Challenge vertical slice (#252)"
              className="bg-bungie-blue text-white text-xs font-bold uppercase tracking-wider px-5 py-3 opacity-40 cursor-not-allowed"
            >
              Run the Weekly · Coming soon
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Roll → apply → run {challenge.activityName} → auto-scored from your PGCR. Loop wiring is in progress.
          </p>
        </section>

        <StandingsPreview entries={standings} />

        <Link href="/leaderboards" className="inline-block text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-bungie-blue">
          View full leaderboard →
        </Link>
      </div>
    </PlatformShell>
  );
}
