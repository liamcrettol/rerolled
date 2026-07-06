import type { ReactNode } from "react";
import TopNav from "./TopNav";

// Shared page frame for every platform route (#243) — top nav + centered
// max-width column. Keeps the nav identical across PLAY / WEEKLY / LEADERBOARDS
// / STATS instead of re-implementing the header per page.
export default function PlatformShell({
  displayName,
  children,
}: {
  displayName?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bungie-dark">
      <TopNav displayName={displayName} />
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
