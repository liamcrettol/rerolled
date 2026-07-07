import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLobbyByCode, getLobbyMembers } from "@/lib/lobby";
import { getUsersBadges } from "@/lib/badges/data";
import LobbyRoom from "@/components/LobbyRoom";

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

  const members = await getLobbyMembers(lobby.id);
  const isMember = members.some((m) => m.user_id === session.userId);
  if (!isMember) redirect("/dashboard");

  const memberBadges = await getUsersBadges(members.map((m) => m.user_id));

  return (
    <main className="min-h-screen p-6 w-full">
      <LobbyRoom
        lobby={lobby}
        initialMembers={members}
        currentUserId={session.userId}
        currentUserDisplayName={session.displayName}
        bungieMembershipType={session.bungieMembershipType}
        bungieMembershipId={session.bungieMembershipId}
        memberBadges={memberBadges}
      />
    </main>
  );
}
