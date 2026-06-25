import { adminSupabase } from "@/lib/supabase/admin";
import type { Lobby, LobbyMember } from "@/types/lobby";

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createLobby(
  hostUserId: string,
  displayName: string,
  bungieMembershipType: number,
  bungieMembershipId: string
): Promise<{ lobby: Lobby; member: LobbyMember }> {
  const code = generateCode();

  const { data: lobby, error: lobbyErr } = await adminSupabase
    .from("lobbies")
    .insert({
      code,
      host_user_id: hostUserId,
      captain_user_id: hostUserId,
      status: "waiting",
      current_round: 1,
    })
    .select()
    .single();

  if (lobbyErr || !lobby) throw new Error(lobbyErr?.message ?? "Failed to create lobby");

  const { data: member, error: memberErr } = await adminSupabase
    .from("lobby_members")
    .insert({
      lobby_id: lobby.id,
      user_id: hostUserId,
      display_name: displayName,
      bungie_membership_type: bungieMembershipType,
      bungie_membership_id: bungieMembershipId,
      is_ready: false,
      is_captain: true,
    })
    .select()
    .single();

  if (memberErr || !member) throw new Error(memberErr?.message ?? "Failed to add host");

  // Create first round
  await adminSupabase.from("lobby_rounds").insert({
    lobby_id: lobby.id,
    round_number: 1,
    status: "pending",
  });

  return { lobby, member };
}

export async function joinLobby(
  code: string,
  userId: string,
  displayName: string,
  bungieMembershipType: number,
  bungieMembershipId: string
): Promise<{ lobby: Lobby; member: LobbyMember }> {
  const { data: lobby, error } = await adminSupabase
    .from("lobbies")
    .select("*")
    .eq("code", code.toUpperCase())
    .single();

  if (error || !lobby) throw new Error("Lobby not found");
  if (lobby.status === "done") throw new Error("Lobby has ended");

  // Upsert member (allow rejoining)
  const { data: member, error: memberErr } = await adminSupabase
    .from("lobby_members")
    .upsert(
      {
        lobby_id: lobby.id,
        user_id: userId,
        display_name: displayName,
        bungie_membership_type: bungieMembershipType,
        bungie_membership_id: bungieMembershipId,
        is_ready: false,
        is_captain: false,
      },
      { onConflict: "lobby_id,user_id" }
    )
    .select()
    .single();

  if (memberErr || !member) throw new Error(memberErr?.message ?? "Failed to join");

  // Someone just joined - mark the lobby active.
  await adminSupabase
    .from("lobbies")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", lobby.id);

  return { lobby, member };
}

export async function getActiveSessionForUser(
  userId: string
): Promise<{ code: string; status: Lobby["status"] } | null> {
  const { data: memberships } = await adminSupabase
    .from("lobby_members")
    .select("lobby_id")
    .eq("user_id", userId);

  if (!memberships || memberships.length === 0) return null;

  const lobbyIds = memberships.map((m) => m.lobby_id);

  const { data: lobby } = await adminSupabase
    .from("lobbies")
    .select("code, status")
    .in("id", lobbyIds)
    .neq("status", "done")
    .limit(1)
    .single();

  if (!lobby) return null;
  return { code: lobby.code, status: lobby.status as Lobby["status"] };
}

export async function getLobbyByCode(code: string): Promise<Lobby | null> {
  const { data } = await adminSupabase
    .from("lobbies")
    .select("*")
    .eq("code", code.toUpperCase())
    .single();
  return data ?? null;
}

export async function getLobbyMembers(lobbyId: string): Promise<LobbyMember[]> {
  const { data } = await adminSupabase
    .from("lobby_members")
    .select("*")
    .eq("lobby_id", lobbyId)
    .order("joined_at");
  return data ?? [];
}

export async function rotateCaptain(lobbyId: string): Promise<void> {
  const members = await getLobbyMembers(lobbyId);
  if (members.length < 2) return;

  const currentCaptainIdx = members.findIndex((m) => m.is_captain);
  const nextIdx = (currentCaptainIdx + 1) % members.length;
  const nextCaptain = members[nextIdx];

  await adminSupabase
    .from("lobby_members")
    .update({ is_captain: false })
    .eq("lobby_id", lobbyId);

  await adminSupabase
    .from("lobby_members")
    .update({ is_captain: true })
    .eq("id", nextCaptain.id);

  await adminSupabase
    .from("lobbies")
    .update({ captain_user_id: nextCaptain.user_id })
    .eq("id", lobbyId);
}
