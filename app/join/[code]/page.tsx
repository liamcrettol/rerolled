import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { joinLobby } from "@/lib/lobby";
import { MODE_BASE_PATH } from "@/types/lobby";
import type { LobbyMode } from "@/types/lobby";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  const { code } = await params;
  const upper = code.toUpperCase();

  if (!session?.userId) {
    // Not signed in: start Bungie OAuth immediately and preserve the invite.
    redirect(`/api/auth/bungie/login?returnTo=${encodeURIComponent(`/join/${upper}`)}`);
  }

  // The joined lobby's mode decides which board the invite lands on. This was
  // hardcoded to /lobby, which dropped draft and endgame invitees into the
  // roulette room where they could never see their fireteam's session.
  let mode: LobbyMode = "roulette";
  try {
    const { lobby } = await joinLobby(
      upper,
      session.userId,
      session.displayName,
      session.bungieMembershipType,
      session.bungieMembershipId
    );
    mode = (lobby.mode as LobbyMode) ?? "roulette";
  } catch {
    redirect("/dashboard");
  }

  redirect(`${MODE_BASE_PATH[mode] ?? "/lobby"}/${upper}`);
}
