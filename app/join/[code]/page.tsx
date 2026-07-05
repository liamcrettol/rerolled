import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { joinLobby } from "@/lib/lobby";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  const { code } = await params;
  const upper = code.toUpperCase();

  if (!session?.userId) {
    // Not signed in: start Bungie OAuth immediately and preserve the invite.
    redirect(`/api/auth/bungie/login?returnTo=${encodeURIComponent(`/join/${upper}`)}`);
  }

  try {
    await joinLobby(
      upper,
      session.userId,
      session.displayName,
      session.bungieMembershipType,
      session.bungieMembershipId
    );
  } catch {
    redirect("/dashboard");
  }

  redirect(`/lobby/${upper}`);
}
