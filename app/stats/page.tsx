import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import PlatformShell from "@/components/platform/PlatformShell";
import SeasonPanel from "@/components/platform/SeasonPanel";
import BadgeShelf from "@/components/badges/BadgeShelf";
import DashboardStats from "@/components/DashboardStats";
import Spinner from "@/components/Spinner";
import { getSeasonStats } from "@/lib/stats/season";
import { getUserBadges } from "@/lib/badges/data";

// Stats page (#250). Your Season summary panel plus the existing roulette
// aggregate stats. The panel data is mock for this pass; the durable
// season/profile aggregation layer is #258.
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const [season, badges] = await Promise.all([
    getSeasonStats(session.userId),
    getUserBadges(session.userId),
  ]);

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="space-y-8">
        <div className="grid md:grid-cols-2 gap-6 items-start max-w-3xl">
          <SeasonPanel stats={season} />
          <div className="space-y-2">
            <BadgeShelf badges={badges} />
            <Link
              href="/badges"
              className="inline-block text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-bungie-blue"
            >
              View full Badge Case &gt;
            </Link>
          </div>
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
