import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LobbyControls from "@/components/LobbyControls";

// Draft (#264) reuses the same lobby create/join primitives as roulette —
// a draft session is just a lobby with a draft overlay (lib/draft) instead
// of a rolled round. Creating here routes straight into /draft/[code].
export default async function DraftNewPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  return (
    <main className="min-h-screen p-6 w-full max-w-lg mx-auto space-y-6">
      <h1 className="text-xs font-bold uppercase tracking-wider text-gray-400">
        Draft &middot; Pick &amp; Ban
      </h1>
      <p className="text-sm text-gray-300">
        Create a lobby, then have your fireteam draft weapons for each other from
        your shared pool.
      </p>
      <LobbyControls
        createHref="/draft/new/create"
        createLabel="Create Draft Lobby"
        joinBasePath="/draft"
      />
    </main>
  );
}
