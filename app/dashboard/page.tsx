import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import LobbyControls from "@/components/LobbyControls";
import Leaderboard from "@/components/Leaderboard";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.userId) redirect("/");

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

      <LobbyControls />

      <div className="mt-10">
        <Leaderboard />
      </div>
    </main>
  );
}
