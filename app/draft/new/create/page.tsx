import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createLobby } from "@/lib/lobby";

// Draft reuses the roulette lobby primitive (#266) — creating here is just
// createLobby() followed by a redirect into /draft/[code] instead of /lobby/[code].
export default async function CreateDraftLobbyPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const { lobby } = await createLobby(
    session.userId,
    session.displayName,
    session.bungieMembershipType,
    session.bungieMembershipId
  );

  redirect(`/draft/${lobby.code}`);
}
