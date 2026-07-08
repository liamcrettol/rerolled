import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createLobby } from "@/lib/lobby";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/api/errors";
import Link from "next/link";

// Fireteam Endgame Roulette reuses the roulette lobby primitive, same as
// Draft — creating here is just createLobby() followed by a redirect into
// /endgame/lobby/[code] instead of /lobby/[code] or /draft/[code].
export default async function CreateEndgameLobbyPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  let lobbyCode: string;
  try {
    const { lobby } = await createLobby(
      session.userId,
      session.displayName,
      session.bungieMembershipType,
      session.bungieMembershipId,
      null,
      "endgame"
    );
    lobbyCode = lobby.code;
  } catch (err) {
    if (!isDatabaseUnavailableError(err)) throw err;
    return (
      <main className="min-h-screen p-6 w-full max-w-lg mx-auto flex flex-col justify-center gap-4">
        <p className="section-label text-red-400">Fireteam lobby unavailable</p>
        <h1 className="text-2xl font-bold uppercase tracking-tight text-white">
          Database is timing out
        </h1>
        <p className="text-sm text-gray-400">{DATABASE_UNAVAILABLE_MESSAGE}</p>
        <Link
          href="/endgame/lobby/new"
          className="bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors text-center"
        >
          Back to fireteam setup
        </Link>
      </main>
    );
  }

  redirect(`/endgame/lobby/${lobbyCode}`);
}
