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

// Game-night platform home shell (#243): weekly challenges, mode grid, lobby
// row, week standings, and the Your Season panel — all reading live data.
export const dynamic = "force-dynamic";

const EMPTY_PLACEMENT = { rank: null, bestScore: null, totalRuns: 0 };

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

  const [challenge, pvpChallenge] = await Promise.all([
    getActiveWeeklyChallenge("pve").catch(() => null),
    getActiveWeeklyChallenge("pvp").catch(() => null),
  ]);

  const [activeSession, placement, pvpPlacement, standings, season, runCount, pvpRunCount] = await Promise.all([
    activeSessionPromise,
    getUserWeeklyPlacement(session.userId, challenge?.id ?? null).catch(() => EMPTY_PLACEMENT),
    getUserWeeklyPlacement(session.userId, pvpChallenge?.id ?? null).catch(() => EMPTY_PLACEMENT),
    challenge ? getStandingsPreview(challenge.id, session.userId).catch(() => []) : Promise.resolve([]),
    seasonPromise,
    getWeeklyRunCount(challenge?.id ?? null).catch(() => 0),
    getWeeklyRunCount(pvpChallenge?.id ?? null).catch(() => 0),
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <DashboardLiveRefresh />

      <div className="space-y-8">
        <section>
          <p className="section-label mb-3">Weekly Challenges</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <WeeklyHero
              challenge={challenge}
              placement={placement}
              runCount={runCount}
              accent="blue"
              label="PvE Weekly"
              size="compact"
            />
            <WeeklyHero
              challenge={pvpChallenge}
              placement={pvpPlacement}
              runCount={pvpRunCount}
              accent="red"
              label="PvP Weekly"
              href="/weekly/pvp"
              size="compact"
            />
          </div>
        </section>

        <SeasonPanel stats={season} />

        <ModeGrid />

        <LobbyRow activeSession={activeSession} />

        <StandingsPreview entries={standings} />
      </div>
    </PlatformShell>
  );
}
