import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LobbyControls from "@/components/LobbyControls";

// Draft (#266) reuses the same lobby create/join primitives as roulette — a
// draft round is a normal lobby round, just filled in via a captain-chosen
// 1-of-3 card reveal instead of a random roll. Creating here routes straight
// into /draft/[code].
export default async function DraftNewPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  return (
    <main className="min-h-screen p-6 w-full max-w-lg mx-auto space-y-6">
      <h1 className="text-xs font-bold uppercase tracking-wider text-gray-400">
        Draft &middot; Choose Your Loadout
      </h1>
      <p className="text-sm text-gray-300">
        Create a lobby, then have your captain reveal 3 weapons per slot and pick
        one for the whole fireteam.
      </p>
      <LobbyControls
        createHref="/draft/new/create"
        createLabel="Create Draft Lobby"
        joinBasePath="/draft"
      />
    </main>
  );
}
