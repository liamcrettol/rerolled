import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLobbyByCode, getLobbyMembers } from "@/lib/lobby";
import LobbyRoom from "@/components/LobbyRoom";
import { MODE_BASE_PATH } from "@/types/lobby";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) redirect("/dashboard");

  // This page is the ROULETTE board. A draft member who lands here
  // (old invite redirect, stale tab, bookmark) would sit in a room that can
  // never show their fireteam's session - bounce them to the right board.
  if (lobby.mode && lobby.mode !== "roulette") {
    redirect(`${MODE_BASE_PATH[lobby.mode] ?? "/lobby"}/${lobby.code}`);
  }

  const members = await getLobbyMembers(lobby.id);
  const isMember = members.some((m) => m.user_id === session.userId);
  if (!isMember) redirect("/dashboard");

  return (
    <main className="min-h-screen p-6 w-full">
      <LobbyRoom
        lobby={lobby}
        initialMembers={members}
        currentUserId={session.userId}
        currentUserDisplayName={session.displayName}
        bungieMembershipType={session.bungieMembershipType}
        bungieMembershipId={session.bungieMembershipId}
      />
    </main>
  );
}
