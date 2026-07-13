import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlatformShell from "@/components/platform/PlatformShell";
import ModeGrid from "@/components/platform/ModeGrid";
import SeasonPanel from "@/components/platform/SeasonPanel";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
import CrucibleHistorySync from "@/components/CrucibleHistorySync";
import { getActiveSessionForUser } from "@/lib/lobby";
import { getSeasonStats } from "@/lib/stats/season";
import { queueCrucibleSync } from "@/lib/crucible/queueSync";

// Game-night platform home shell (#243): the Your Season panel and the mode
// grid (whose fourth tile is join/rejoin) — all reading live data.
export const dynamic = "force-dynamic";

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

  const [activeSession, season] = await Promise.all([
    activeSessionPromise,
    seasonPromise,
    syncQueuePromise,
  ]);

  return (
    <PlatformShell displayName={session.displayName} wide>
      <DashboardLiveRefresh />
      <CrucibleHistorySync />

      <div className="mx-auto grid items-stretch gap-5 xl:grid-cols-[minmax(0,694px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ModeGrid activeSession={activeSession} />
        </div>

        <div className="min-h-0 xl:relative">
          <div className="xl:absolute xl:inset-0">
            <SeasonPanel stats={season} variant="dashboard" />
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}
