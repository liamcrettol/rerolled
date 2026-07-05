import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PlatformShell from "@/components/platform/PlatformShell";
import SeasonPanel from "@/components/platform/SeasonPanel";
import DashboardStats from "@/components/DashboardStats";
import Spinner from "@/components/Spinner";
import { getSeasonStats } from "@/lib/stats/season";

// Stats page (#250). Your Season summary panel plus the existing roulette
// aggregate stats. The panel data is mock for this pass; the durable
// season/profile aggregation layer is #258.
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const season = await getSeasonStats(session.userId);

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="space-y-8">
        <div className="max-w-md">
          <SeasonPanel stats={season} />
        </div>

        <div>
          <p className="section-label mb-3">Roulette Stats</p>
          <Suspense fallback={<div className="text-gray-500 py-4 flex items-center gap-2"><Spinner size={14} /></div>}>
            <DashboardStats />
          </Suspense>
        </div>
      </div>
    </PlatformShell>
  );
}
