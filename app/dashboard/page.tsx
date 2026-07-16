import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlatformShell from "@/components/platform/PlatformShell";
import ModeGrid from "@/components/platform/ModeGrid";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
import { getActiveSessionForUser } from "@/lib/lobby";

// Game-night home: the mode grid, centered. The season/stats panel was
// removed with the core-slim plan (docs/plans/core-slim-and-h2h-split.md);
// Match history and head-to-head now live in Rival.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const activeSession = await getActiveSessionForUser(session.userId).catch(() => null);

  return (
    <PlatformShell displayName={session.displayName}>
      <DashboardLiveRefresh />

      <div className="mx-auto w-full max-w-5xl py-6 sm:py-10">
        <div className="mb-7">
          <p className="section-label text-bungie-blue">Fireteam loadouts</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Choose how you want to play.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-base">
            Roll from the weapons everyone owns, or draft a loadout one choice at a time.
          </p>
          <a
            className="mt-4 inline-flex border border-bungie-border px-3 py-2 text-sm font-semibold text-bungie-blue hover:border-bungie-blue hover:text-white"
            href="https://rival.rerolled.io"
          >
            View your match history &amp; head-to-head records
          </a>
        </div>
        <ModeGrid activeSession={activeSession} />
      </div>
    </PlatformShell>
  );
}
