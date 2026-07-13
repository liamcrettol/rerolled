import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PlatformShell from "@/components/platform/PlatformShell";
import Leaderboard from "@/components/Leaderboard";
import WeaponHallOfFame from "@/components/WeaponHallOfFame";
import Spinner from "@/components/Spinner";

export const dynamic = "force-dynamic";

function Loading() {
  return <div className="text-gray-500 py-4 flex items-center gap-2"><Spinner size={14} /></div>;
}

export default async function LeaderboardsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="space-y-8">
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
