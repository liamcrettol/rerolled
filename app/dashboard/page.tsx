import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlatformShell from "@/components/platform/PlatformShell";
import WeeklyHero from "@/components/platform/WeeklyHero";
import ModeGrid from "@/components/platform/ModeGrid";
import LobbyRow from "@/components/platform/LobbyRow";
import StandingsPreview from "@/components/platform/StandingsPreview";
import SeasonPanel from "@/components/platform/SeasonPanel";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
import { getActiveSessionForUser } from "@/lib/lobby";
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";
import { getUserWeeklyPlacement, getStandingsPreview, getWeeklyRunCount } from "@/lib/weekly/leaderboard";
import { getSeasonStats } from "@/lib/stats/season";

// Game-night platform home shell (#243): weekly hero, mode grid, lobby row,
// week standings, and the Your Season panel — all reading live data.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const challenge = await getActiveWeeklyChallenge();
  const [activeSession, placement, standings, season, runCount] = await Promise.all([
    getActiveSessionForUser(session.userId),
    getUserWeeklyPlacement(session.userId, challenge?.id ?? null),
    challenge ? getStandingsPreview(challenge.id, session.userId) : Promise.resolve([]),
    getSeasonStats(session.userId),
    getWeeklyRunCount(challenge?.id ?? null),
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <DashboardLiveRefresh />

      <div className="space-y-8">
        <WeeklyHero challenge={challenge} placement={placement} runCount={runCount} />

        <ModeGrid />

        <LobbyRow activeSession={activeSession} />

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <StandingsPreview entries={standings} />
          </div>
          <div>
            <SeasonPanel stats={season} />
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}
