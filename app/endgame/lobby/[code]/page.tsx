import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLobbyByCode, getLobbyMembers } from "@/lib/lobby";
import EndgameLobbyBoard from "@/components/endgame/EndgameLobbyBoard";

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

  const members = await getLobbyMembers(lobby.id);
  const isMember = members.some((m) => m.user_id === session.userId);
  if (!isMember) redirect("/dashboard");

  return (
    <main className="min-h-screen p-6 w-full">
      <EndgameLobbyBoard lobby={lobby} members={members} currentUserId={session.userId} />
    </main>
  );
}
