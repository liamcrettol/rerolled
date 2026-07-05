import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import PlatformShell from "@/components/platform/PlatformShell";
import StandingsPreview from "@/components/platform/StandingsPreview";
import Leaderboard from "@/components/Leaderboard";
import WeaponHallOfFame from "@/components/WeaponHallOfFame";
import Spinner from "@/components/Spinner";
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";
import { getStandingsPreview } from "@/lib/weekly/leaderboard";

// Leaderboards hub (#249). Surfaces the weekly standings preview alongside the
// existing all-time roulette leaderboard + weapon hall of fame so both status
// layers live under one nav item.
export const dynamic = "force-dynamic";

function Loading() {
  return <div className="text-gray-500 py-4 flex items-center gap-2"><Spinner size={14} /></div>;
}

export default async function LeaderboardsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const challenge = await getActiveWeeklyChallenge();
  const standings = challenge ? await getStandingsPreview(challenge.id, session.userId) : [];

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="space-y-8">
        <div>
          <StandingsPreview entries={standings} showViewAll={false} />
          {challenge && (
            <Link
              href="/weekly/leaderboard"
              className="inline-block mt-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-bungie-blue"
            >
              Full weekly leaderboard →
            </Link>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <p className="section-label mb-3">All-Time Roulette</p>
            <Suspense fallback={<Loading />}>
              <Leaderboard />
            </Suspense>
          </div>
          <div>
            <p className="section-label mb-3">Weapon Hall of Fame</p>
            <Suspense fallback={<Loading />}>
              <WeaponHallOfFame />
            </Suspense>
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}
