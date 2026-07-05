import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlatformShell from "@/components/platform/PlatformShell";
import { StandingsRow } from "@/components/platform/StandingsPreview";
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";
import { getWeeklyStandings } from "@/lib/weekly/leaderboard";

// Full weekly leaderboard for the active week (#249). Skeleton uses the mock
// standings and a fixed result cap; real pagination lands with persisted runs.
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 50;

export default async function WeeklyLeaderboardPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const challenge = await getActiveWeeklyChallenge();
  const entries = challenge ? await getWeeklyStandings(challenge.id, PAGE_LIMIT) : [];

  return (
    <PlatformShell displayName={session.displayName}>
      <p className="section-label mb-1">Weekly Leaderboard</p>
      <h1 className="text-2xl font-bold uppercase tracking-tight text-white mb-6">
        {challenge ? `${challenge.title} · Week ${challenge.weekNumber}` : "No active week"}
      </h1>

      <div className="panel">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-bungie-border">
          <span className="section-label w-8 shrink-0">#</span>
          <span className="section-label flex-1">Guardian</span>
          <span className="section-label w-14 text-right shrink-0 hidden sm:block">Time</span>
          <span className="section-label w-16 text-right shrink-0">Score</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500 px-3 py-8 text-center">No runs yet this week.</p>
        ) : (
          entries.map((e) => <StandingsRow key={`${e.rank}-${e.userId}`} entry={e} />)
        )}
      </div>

      <p className="text-xs text-gray-600 mt-3">
        Showing top {PAGE_LIMIT}. Pagination arrives with persisted run results (#249).
      </p>
    </PlatformShell>
  );
}
