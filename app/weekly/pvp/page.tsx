import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import PlatformShell from "@/components/platform/PlatformShell";
import RuleChips from "@/components/platform/RuleChips";
import ResetCountdown from "@/components/platform/ResetCountdown";
import StandingsPreview from "@/components/platform/StandingsPreview";
import RunFlow from "@/components/runs/RunFlow";
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";
import { getStandingsPreview } from "@/lib/weekly/leaderboard";

// PvP Weekly Challenge detail + run start (#296) - mirrors app/weekly/page.tsx
// (the PvE weekly), themed red instead of blue and reading the "pvp" pillar.
// Time-to-clear isn't a meaningful PvP stat, so the standings preview hides
// that column.
export const dynamic = "force-dynamic";

export default async function PvpWeeklyPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const challenge = await getActiveWeeklyChallenge("pvp");
  const standings = challenge ? await getStandingsPreview(challenge.id, session.userId) : [];

  if (!challenge) {
    return (
      <PlatformShell displayName={session.displayName}>
        <p className="section-label mb-2">PvP Weekly Challenge</p>
        <h1 className="text-2xl font-bold uppercase tracking-tight text-white">No active week</h1>
        <p className="text-sm text-gray-400 mt-2">The next challenge hasn&apos;t been published yet.</p>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="space-y-8">
        <section className="panel border-l-2 border-l-red-400 p-6">
          <p className="section-label text-red-400 mb-2">
            Week {challenge.weekNumber} · {challenge.activityName}
          </p>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-white">{challenge.title}</h1>

          <div className="mt-4">
            <RuleChips rules={challenge.rules} />
          </div>

          <div className="mt-6 mb-6">
            <p className="section-label mb-1">Resets in</p>
            <p className="text-lg font-bold"><ResetCountdown endsAt={challenge.endsAt} /></p>
          </div>

          <RunFlow
            mode="weekly_challenge"
            weeklyChallengeId={challenge.id}
            activityName={challenge.activityName}
            accent="red"
          />
        </section>

        <StandingsPreview entries={standings} showTime={false} />

        <Link href="/leaderboards" className="inline-block text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-bungie-blue">
          View full leaderboard →
        </Link>
      </div>
    </PlatformShell>
  );
}
