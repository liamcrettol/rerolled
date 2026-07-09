import type { ReactNode } from "react";
import TopNav from "./TopNav";
import { auth } from "@/lib/auth";
import { getClan } from "@/lib/bungie/clan";
import { getPrimaryCharacterEmblem } from "@/lib/bungie/inventory";

// Shared page frame for every platform route (#243) — top nav + centered
// max-width column. Keeps the nav identical across PLAY / WEEKLY / LEADERBOARDS
// / STATS instead of re-implementing the header per page.
export default async function PlatformShell({
  displayName,
  children,
}: {
  displayName?: string;
  children: ReactNode;
}) {
  const session = await auth();

  // Emblem/clan are cosmetic chrome for the nav player card (#318) — best
  // effort only, never block the page on a Bungie hiccup.
  const [emblem, clan] = session?.bungieAccessToken
    ? await Promise.all([
        getPrimaryCharacterEmblem(session.bungieMembershipType, session.bungieMembershipId, session.bungieAccessToken).catch(
          () => null
        ),
        getClan(session.bungieMembershipType, session.bungieMembershipId, session.bungieAccessToken).catch(() => null),
      ])
    : [null, null];

  return (
    <div className="min-h-screen bg-bungie-dark">
      <TopNav
        displayName={session?.displayName ?? displayName}
        emblemPath={emblem?.emblemPath}
        emblemBackgroundPath={emblem?.emblemBackgroundPath}
        clanTag={clan?.tag || clan?.name}
      />
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
