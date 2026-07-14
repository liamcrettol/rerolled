import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLobbyByCode, getLobbyMembers } from "@/lib/lobby";
import EndgameLobbyBoard from "@/components/endgame/EndgameLobbyBoard";
import { MODE_BASE_PATH } from "@/types/lobby";

export default async function EndgameLobbyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) redirect("/dashboard");

  // This page is the ENDGAME board - bounce members of other-mode lobbies to
  // their actual board rather than stranding them here.
  if (lobby.mode !== "endgame") {
    redirect(`${MODE_BASE_PATH[lobby.mode] ?? "/lobby"}/${lobby.code}`);
  }

  const members = await getLobbyMembers(lobby.id);
  const isMember = members.some((m) => m.user_id === session.userId);
  if (!isMember) redirect("/dashboard");

  return (
    <main className="min-h-screen p-6 w-full">
      <EndgameLobbyBoard lobby={lobby} members={members} currentUserId={session.userId} />
    </main>
  );
}
