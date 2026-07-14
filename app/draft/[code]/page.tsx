import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLobbyByCode, getLobbyMembers } from "@/lib/lobby";
import { getBungieToken } from "@/lib/auth/helpers";
import { getCharacters } from "@/lib/bungie/inventory";
import { getClan } from "@/lib/bungie/clan";
import { getUsersBadges } from "@/lib/badges/data";
import DraftBoard from "@/components/DraftBoard";
import { MODE_BASE_PATH } from "@/types/lobby";
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
  if (!lobby || lobby.status === "done") redirect("/dashboard");

  // This page is the DRAFT board - bounce members of other-mode lobbies to
  // their actual board rather than stranding them here.
  if (lobby.mode !== "draft") {
    redirect(`${MODE_BASE_PATH[lobby.mode] ?? "/lobby"}/${lobby.code}`);
  }

  const members = await getLobbyMembers(lobby.id);
  const isMember = members.some((m) => m.user_id === session.userId);
  if (!isMember) redirect("/dashboard");

  const memberBadges = await getUsersBadges(members.map((m) => m.user_id));
  const membersWithBadges = members.map((m) => ({
    ...m,
    badges: memberBadges[m.user_id] ?? [],
  }));

  try {
    const token = await getBungieToken(session.userId, session.bungieMembershipId);
    const [characters, clan] = await Promise.all([
      getCharacters(session.bungieMembershipType, session.bungieMembershipId, token),
      getClan(session.bungieMembershipType, session.bungieMembershipId, token).catch(() => null),
    ]);
    const latest = lastPlayedCharacter(characters);
    const current = membersWithBadges.find((m) => m.user_id === session.userId);

    if (current) {
      if (latest) {
        current.selected_character_id = latest.characterId;
        current.emblem_path = latest.emblemPath;
        current.emblem_background_path = latest.emblemBackgroundPath;
      }
      if (clan) {
        current.clan_name = clan.name;
        current.clan_tag = clan.tag;
      }
    }
  } catch {
    // Cosmetic only. DraftBoard can still load characters client-side.
  }

  return (
    <main className="min-h-screen p-6 w-full [&_.w-48]:w-72 [&_.w-48]:max-w-full [&_.flex.flex-wrap.gap-2]:justify-center">
      <DraftBoard lobby={lobby} members={membersWithBadges} currentUserId={session.userId} />
    </main>
  );
}
