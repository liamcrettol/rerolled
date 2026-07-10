import type { ReactNode } from "react";
import TopNav from "./TopNav";
import { auth } from "@/lib/auth";
import { getBungieToken } from "@/lib/auth/helpers";
import { getClan } from "@/lib/bungie/clan";
import { getPrimaryCharacterEmblem } from "@/lib/bungie/inventory";
import { getUserBadges } from "@/lib/badges/data";

// Shared page frame for every platform route (#243) — top nav + centered
// max-width column. Keeps the nav identical across PLAY / WEEKLY / LEADERBOARDS
// / STATS instead of re-implementing the header per page.
export default async function PlatformShell({
  displayName,
  children,
  wide = false,
}: {
  displayName?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const session = await auth();

  // Emblem/clan are cosmetic chrome for the nav player card (#318) — best
  // effort only, never block the page on a Bungie hiccup. session.bungieAccessToken
  // is the raw token from login and goes stale; getBungieToken() decrypts the
  // stored token and auto-refreshes it, same as every other Bungie call in the app.
  const [emblem, clan] = session?.userId
    ? await getBungieToken(session.userId, session.bungieMembershipId)
        .then((token) =>
          Promise.all([
            getPrimaryCharacterEmblem(session.bungieMembershipType, session.bungieMembershipId, token).catch(() => null),
            getClan(session.bungieMembershipType, session.bungieMembershipId, token).catch(() => null),
          ])
        )
        .catch(() => [null, null])
    : [null, null];

  const badges = session?.userId ? await getUserBadges(session.userId).catch(() => []) : [];

  return (
    <div className="min-h-screen bg-bungie-dark">
      <TopNav
        displayName={session?.displayName ?? displayName}
        emblemPath={emblem?.emblemPath}
        emblemBackgroundPath={emblem?.emblemBackgroundPath}
        clanName={clan?.name}
        badges={badges}
      />
      <main className={`${wide ? "max-w-[1400px]" : "max-w-7xl"} mx-auto px-6 py-8`}>{children}</main>
    </div>
  );
}
