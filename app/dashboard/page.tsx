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
import { getUserWeeklyPlacement, getStandingsPreview } from "@/lib/weekly/leaderboard";
import { getSeasonStats } from "@/lib/stats/season";

// New game-night platform home shell (#243). Replaces the old single-purpose
// dashboard with the framing layer: weekly hero, mode grid, lobby row, week
// standings, and the Your Season panel. Weekly/Score Attack data is mock for
// this first pass; the existing Gun Roulette lobby flow remains fully usable.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const challenge = await getActiveWeeklyChallenge();
  const [activeSession, placement, standings, season] = await Promise.all([
    getActiveSessionForUser(session.userId),
    getUserWeeklyPlacement(session.userId),
    challenge ? getStandingsPreview(challenge.id, session.userId) : Promise.resolve([]),
    getSeasonStats(session.userId),
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <DashboardLiveRefresh />

      <div className="space-y-8">
        {/* runCount is placeholder mock data for this first pass (#243). */}
        <WeeklyHero challenge={challenge} placement={placement} runCount={1284} />

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
