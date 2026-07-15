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

      <div className="mx-auto w-full max-w-5xl py-6 sm:py-10">
        <div className="mb-7">
          <p className="section-label text-bungie-blue">Fireteam loadouts</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Choose how you want to play.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-base">
            Roll from the weapons everyone owns, or draft a loadout one choice at a time.
          </p>
        </div>
        <ModeGrid activeSession={activeSession} />
      </div>
    </PlatformShell>
  );
}
