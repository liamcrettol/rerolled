import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SignOutButton from "@/components/SignOutButton";
import LobbyControls from "@/components/LobbyControls";
import Leaderboard from "@/components/Leaderboard";
import WeaponHallOfFame from "@/components/WeaponHallOfFame";
import DashboardStats from "@/components/DashboardStats";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
import GlowBackdrop from "@/components/GlowBackdrop";
import { getActiveSessionForUser } from "@/lib/lobby";
import Spinner from "@/components/Spinner";

// Always render fresh so the global leaderboard reflects the latest games.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const activeSession = await getActiveSessionForUser(session.userId);

  return (
    <main className="min-h-screen p-6 w-full">
      <div className="max-w-5xl mx-auto">
        <div className="relative overflow-hidden glass-card rounded-xl mb-8 animate-rise-in" style={{ opacity: 0 }}>
          <GlowBackdrop />
          <header className="flex items-center justify-between p-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Gun Roulette</h1>
              <p className="text-gray-400 text-sm">
                Signed in as{" "}
                <span className="text-bungie-blue font-medium">
                  {session.displayName}
                </span>
              </p>
              <p className="text-gray-500 text-xs mt-1 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                Destiny account connected · weapon data loads when you join a lobby
              </p>
            </div>
            <SignOutButton />
          </header>
        </div>

        <LobbyControls activeSession={activeSession} />

        <DashboardLiveRefresh />

        <div className="mt-8">
          <Suspense fallback={<div className="text-gray-500 text-sm py-4 flex items-center gap-2"><Spinner size={14} />Loading stats...</div>}>
            <DashboardStats />
          </Suspense>
        </div>

        <div className="mt-8 grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <Suspense fallback={<div className="text-gray-500 text-sm py-4 flex items-center gap-2"><Spinner size={14} />Loading leaderboard...</div>}>
              <Leaderboard />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<div className="text-gray-500 text-sm py-4 flex items-center gap-2"><Spinner size={14} />Loading hall of fame...</div>}>
              <WeaponHallOfFame />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
