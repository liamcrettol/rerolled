import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLobbyByCode, getLobbyMembers } from "@/lib/lobby";
import { getBungieToken } from "@/lib/auth/helpers";
import { getCharacters } from "@/lib/bungie/inventory";
import DraftBoard from "@/components/DraftBoard";
import DraftLeaveButton from "@/components/draft/DraftLeaveButton";
import type { DestinyCharacter } from "@/types/bungie";

function lastPlayedCharacter(characters: DestinyCharacter[]): DestinyCharacter | null {
  return [...characters].sort(
    (a, b) => new Date(b.dateLastPlayed).getTime() - new Date(a.dateLastPlayed).getTime()
  )[0] ?? null;
}

export default async function DraftPage({
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

  try {
    const token = await getBungieToken(session.userId, session.bungieMembershipId);
    const latest = lastPlayedCharacter(
      await getCharacters(session.bungieMembershipType, session.bungieMembershipId, token)
    );

    if (latest) {
      const current = members.find((m) => m.user_id === session.userId);
      if (current) {
        current.selected_character_id = latest.characterId;
        current.emblem_path = latest.emblemPath;
        current.emblem_background_path = latest.emblemBackgroundPath;
      }
    }
  } catch {
    // Cosmetic only. DraftBoard can still load characters client-side.
  }

  return (
    <main className="min-h-screen p-6 w-full [&_.w-48]:w-80 [&_.w-48]:max-w-full [&_.flex.flex-wrap.gap-2]:justify-center">
      <DraftLeaveButton lobbyId={lobby.id} />
      <DraftBoard lobby={lobby} members={members} currentUserId={session.userId} />
    </main>
  );
}
