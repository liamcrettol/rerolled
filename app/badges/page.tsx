import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlatformShell from "@/components/platform/PlatformShell";
import BadgeCase from "@/components/badges/BadgeCase";
import { getBadgeCatalog } from "@/lib/badges/data";

// Full Badge Case (#297) — every badge the player can see, grouped by mode.
export const dynamic = "force-dynamic";

export default async function BadgesPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const badges = await getBadgeCatalog(session.userId);

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="section-label mb-1">Badge Case</p>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-white">
            Every badge, by mode
          </h1>
        </div>
        <BadgeCase badges={badges} />
      </div>
    </PlatformShell>
  );
}
