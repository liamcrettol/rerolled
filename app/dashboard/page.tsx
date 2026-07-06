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

  const activeSessionPromise = getActiveSessionForUser(session.userId).catch(() => null);
  const seasonPromise = getSeasonStats(session.userId).catch(() => ({
    seasonKey: "",
    seasonName: "Season",
    totalRuns: 0,
    rouletteKills: 0,
    weeklyChallengesCleared: 0,
    bestWeeklyPlacement: null,
    bestWeapon: null,
  }));

  const challenge = await getActiveWeeklyChallenge().catch(() => null);
  const [activeSession, placement, standings, season, runCount] = await Promise.all([
    activeSessionPromise,
    getUserWeeklyPlacement(session.userId, challenge?.id ?? null).catch(() => ({
      rank: null,
      bestScore: null,
      totalRuns: 0,
    })),
    challenge ? getStandingsPreview(challenge.id, session.userId).catch(() => []) : Promise.resolve([]),
    seasonPromise,
    getWeeklyRunCount(challenge?.id ?? null).catch(() => 0),
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <DashboardLiveRefresh />

      <div className="space-y-8">
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2"><WeeklyHero challenge={challenge} placement={placement} runCount={runCount} /></div>
          <div>
            <SeasonPanel stats={season} />
          </div>
        </div>

        <ModeGrid />

        <LobbyRow activeSession={activeSession} />

        <StandingsPreview entries={standings} />
      </div>
    </PlatformShell>
  );
}
