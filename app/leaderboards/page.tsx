import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import PlatformShell from "@/components/platform/PlatformShell";
import StandingsPreview, { StandingsRow } from "@/components/platform/StandingsPreview";
import Leaderboard from "@/components/Leaderboard";
import WeaponHallOfFame from "@/components/WeaponHallOfFame";
import Spinner from "@/components/Spinner";
import { Crosshair } from "lucide-react";
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";
import { getStandingsPreview } from "@/lib/weekly/leaderboard";
import { getScoreAttackStandings } from "@/lib/scoreAttack/leaderboard";

// Leaderboards hub (#249). Weekly standings, Score Attack top runs, the
// all-time roulette leaderboard, and the weapon hall of fame under one nav
// item — each mode keeps its own accent.
export const dynamic = "force-dynamic";

function Loading() {
  return <div className="text-gray-500 py-4 flex items-center gap-2"><Spinner size={14} /></div>;
}

export default async function LeaderboardsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const challenge = await getActiveWeeklyChallenge();
  const [standings, scoreAttack] = await Promise.all([
    challenge ? getStandingsPreview(challenge.id, session.userId) : Promise.resolve([]),
    getScoreAttackStandings(10, session.userId),
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="space-y-8">
        <div className="grid lg:grid-cols-2 gap-6 items-start">
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

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Crosshair size={12} className="text-amber-400" aria-hidden="true" />
              <p className="section-label text-amber-400">Score Attack · Top Runs</p>
            </div>
            <div className="panel border-l-2 border-l-amber-400/40">
              <div className="flex items-center gap-3 px-3 py-2 border-b border-bungie-border">
                <span className="section-label w-8 shrink-0">#</span>
                <span className="section-label flex-1">Guardian</span>
                <span className="section-label w-14 text-right shrink-0 hidden sm:block">Time</span>
                <span className="section-label w-16 text-right shrink-0">Score</span>
              </div>
              {scoreAttack.length === 0 ? (
                <p className="text-sm text-gray-500 px-3 py-6 text-center">
                  No scored runs on record.
                </p>
              ) : (
                scoreAttack.map((e) => <StandingsRow key={e.userId} entry={e} />)
              )}
            </div>
          </section>
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
