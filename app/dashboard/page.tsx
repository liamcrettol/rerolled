import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SignOutButton from "@/components/SignOutButton";
import LobbyControls from "@/components/LobbyControls";
import Leaderboard from "@/components/Leaderboard";
import WeaponHallOfFame from "@/components/WeaponHallOfFame";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
import { getActiveSessionForUser } from "@/lib/lobby";

// Always render fresh so the global leaderboard reflects the latest games.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const activeSession = await getActiveSessionForUser(session.userId);

  return (
    <main className="min-h-screen p-6 w-full max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Gun Roulette</h1>
          <p className="text-gray-400 text-sm">
            Signed in as{" "}
            <span className="text-bungie-blue font-medium">
              {session.displayName}
            </span>
          </p>
        </div>
        <SignOutButton />
      </header>

      <LobbyControls activeSession={activeSession} />

      <DashboardLiveRefresh />

      <div className="mt-10 space-y-6">
        <Suspense fallback={<div className="text-gray-500 text-sm py-4">Loading leaderboard...</div>}>
          <Leaderboard />
        </Suspense>
        <Suspense fallback={<div className="text-gray-500 text-sm py-4">Loading hall of fame...</div>}>
          <WeaponHallOfFame />
        </Suspense>
      </div>
    </main>
  );
}
