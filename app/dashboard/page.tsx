import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlatformShell from "@/components/platform/PlatformShell";
import WeeklyHero from "@/components/platform/WeeklyHero";
import ModeGrid from "@/components/platform/ModeGrid";
import SeasonPanel from "@/components/platform/SeasonPanel";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
import CrucibleHistorySync from "@/components/CrucibleHistorySync";
import { getActiveSessionForUser } from "@/lib/lobby";
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";
import { getUserWeeklyPlacement, getWeeklyRunCount } from "@/lib/weekly/leaderboard";
import { getSeasonStats } from "@/lib/stats/season";
import { queueCrucibleSync } from "@/lib/crucible/queueSync";

// Game-night platform home shell (#243): weekly challenges, the Your Season
// panel, and the mode grid (whose fourth tile is join/rejoin) — all reading
// live data.
export const dynamic = "force-dynamic";

const EMPTY_PLACEMENT = { rank: null, bestScore: null, totalRuns: 0 };

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const activeSessionPromise = getActiveSessionForUser(session.userId).catch(() => null);
  const syncQueuePromise = queueCrucibleSync(session.userId).catch(() => null);
  const seasonPromise = getSeasonStats(session.userId).catch(() => ({
    seasonKey: "",
    seasonName: "Season",
    totalRuns: 0,
    rouletteKills: 0,
    weeklyChallengesCleared: 0,
    bestWeeklyPlacement: null,
    bestWeapon: null,
    matchHistory: [],
    historySyncStatus: "idle" as const,
  }));

  const [challenge, pvpChallenge] = await Promise.all([
    getActiveWeeklyChallenge("pve").catch(() => null),
    getActiveWeeklyChallenge("pvp").catch(() => null),
  ]);

  const [activeSession, placement, pvpPlacement, season, runCount, pvpRunCount] = await Promise.all([
    activeSessionPromise,
    getUserWeeklyPlacement(session.userId, challenge?.id ?? null).catch(() => EMPTY_PLACEMENT),
    getUserWeeklyPlacement(session.userId, pvpChallenge?.id ?? null).catch(() => EMPTY_PLACEMENT),
    seasonPromise,
    getWeeklyRunCount(challenge?.id ?? null).catch(() => 0),
    getWeeklyRunCount(pvpChallenge?.id ?? null).catch(() => 0),
    syncQueuePromise,
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <DashboardLiveRefresh />
      <CrucibleHistorySync />

      <div className="mx-auto grid max-w-[1600px] items-start gap-6 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.8fr)]">
        <section>
          <p className="section-label mb-4">Weekly Challenges</p>
          <div className="grid gap-4 lg:grid-cols-2">
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

        <div className="xl:row-span-2">
          <SeasonPanel stats={season} variant="dashboard" />
        </div>

        <ModeGrid activeSession={activeSession} />
      </div>
    </PlatformShell>
  );
}
