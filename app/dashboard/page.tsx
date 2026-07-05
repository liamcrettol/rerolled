import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SignOutButton from "@/components/SignOutButton";
import LobbyControls from "@/components/LobbyControls";
import Leaderboard from "@/components/Leaderboard";
import WeaponHallOfFame from "@/components/WeaponHallOfFame";
import DashboardStats from "@/components/DashboardStats";
import DashboardLiveRefresh from "@/components/DashboardLiveRefresh";
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
        <header className="flex items-center justify-between gap-4 border-b border-bungie-border pb-4 mb-8">
          <h1 className="text-lg font-bold uppercase tracking-wider text-white">Gun Roulette</h1>
          <div className="flex items-center gap-4 min-w-0">
            <span className="text-sm text-gray-400 truncate">{session.displayName}</span>
            <SignOutButton />
          </div>
        </header>

        <LobbyControls activeSession={activeSession} />

        <DashboardLiveRefresh />

        <div className="mt-8">
          <Suspense fallback={<div className="text-gray-500 py-4 flex items-center gap-2"><Spinner size={14} /></div>}>
            <DashboardStats />
          </Suspense>
        </div>

        <div className="mt-8 grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <Suspense fallback={<div className="text-gray-500 py-4 flex items-center gap-2"><Spinner size={14} /></div>}>
              <Leaderboard />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<div className="text-gray-500 py-4 flex items-center gap-2"><Spinner size={14} /></div>}>
              <WeaponHallOfFame />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
