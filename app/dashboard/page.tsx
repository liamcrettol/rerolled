import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlatformShell from "@/components/platform/PlatformShell";
import ModeGrid from "@/components/platform/ModeGrid";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
import CrucibleHistorySync from "@/components/CrucibleHistorySync";
import { getActiveSessionForUser } from "@/lib/lobby";
import { queueCrucibleSync } from "@/lib/crucible/queueSync";

// Game-night home: the mode grid, centered. The season/stats panel was
// removed with the core-slim plan (docs/plans/core-slim-and-h2h-split.md);
// match history and head-to-head move to their own site. The Crucible sync
// stays mounted so imported history keeps accruing until that split ships.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const [activeSession] = await Promise.all([
    getActiveSessionForUser(session.userId).catch(() => null),
    queueCrucibleSync(session.userId).catch(() => null),
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <DashboardLiveRefresh />
      <CrucibleHistorySync />

      <div className="mx-auto flex min-h-[calc(100vh-7.5rem)] w-full max-w-[694px] flex-col justify-center">
        <ModeGrid activeSession={activeSession} />
      </div>
    </PlatformShell>
  );
}
