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
    <main className="armory-shell min-h-screen p-4 sm:p-6 w-full">
      <div className="max-w-5xl mx-auto">
        <div className="relative overflow-hidden armory-panel mb-7 animate-rise-in" style={{ opacity: 0 }}>
          <GlowBackdrop />
          <header className="relative flex items-start justify-between gap-5 p-5 sm:p-6">
            <div>
              <p className="armory-kicker mb-2">D2 Roulette Armory</p>
              <h1 className="font-mono text-3xl font-black uppercase tracking-[-0.02em] text-white sm:text-4xl">
                Gun Roulette
              </h1>
              <div className="armory-rule mt-3 w-48" />
              <p className="mt-3 text-gray-400 text-sm">
                Signed in as{" "}
                <span className="font-mono text-bungie-blue font-semibold">
                  {session.displayName}
                </span>
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
