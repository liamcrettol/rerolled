import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";
import type { Lobby, LobbyMember, LobbyMode, LobbyRollSettings } from "@/types/lobby";

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createLobby(
  hostUserId: string,
  displayName: string,
  bungieMembershipType: number,
  bungieMembershipId: string,
  initialSettings?: Partial<LobbyRollSettings> | null,
  mode: LobbyMode = "roulette"
): Promise<{ lobby: Lobby; member: LobbyMember }> {
  const code = generateCode();

  const rollSettings: LobbyRollSettings | null = initialSettings
    ? {
        mode: initialSettings.mode ?? "normal",
        rerollLimit: initialSettings.rerollLimit ?? null,
        // Weapon cycling is now always enforced by the roll API. Keep the
        // legacy setting true for older clients that still display it.
        noDup: true,
        banned: initialSettings.banned ?? [],
        slots: { kinetic: "normal", energy: "normal", power: "wildcard" },
      }
    : null;

  const { data: lobby, error: lobbyErr } = await adminSupabase
    .from("lobbies")
    .insert({
      code,
      host_user_id: hostUserId,
      captain_user_id: hostUserId,
      status: "waiting",
      mode,
      current_round: 1,
      ...(rollSettings ? { roll_settings: rollSettings } : {}),
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

  // Create first round. supabase-js resolves with { error } instead of
  // throwing, so this error must be checked: a swallowed failure here returns a
  // lobby with no round 1, and nothing backfills it (next-round only inserts
  // round N+1), leaving the lobby permanently unrollable while the client is
  // told creation succeeded.
  const { error: roundErr } = await adminSupabase.from("lobby_rounds").insert({
    lobby_id: lobby.id,
    round_number: 1,
    status: "pending",
  });

  if (roundErr) throw new Error(roundErr.message ?? "Failed to create first round");

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

  // Upsert member (allow rejoining). is_captain is deliberately omitted: the
  // column's own default (false) covers a genuine new row, but including it
  // here would also fire on a rejoin - re-hitting the invite link, or any
  // retry of this same call - and forcibly clear captaincy from whoever the
  // upserted row belongs to if they currently hold it, desyncing
  // lobby_members.is_captain from lobbies.captain_user_id with nothing to
  // reassign it. rotateCaptain then finds no member flagged captain and
  // wedges the round (see rotateCaptain's own fallback below).
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
  userId: string,
  // Restrict to a single mode. Without this, the most-recently-active lobby
  // across ALL modes wins - fine for the dashboard's generic "resume" banner,
  // but a mode-specific page can need its own active
  // lobby even when a different-mode lobby was touched more recently (#292).
  mode?: LobbyMode
): Promise<{ code: string; status: Lobby["status"]; mode: LobbyMode } | null> {
  try {
    // lobby_members rows are never deleted (lobbies are only soft-closed),
    // so an active/heavy user accumulates one row per lobby they've ever
    // joined across the app's lifetime. Only the most recently joined ones
    // can plausibly still be the active session, so bound the scan instead
    // of pulling every row a long-tenured user has ever had (#390).
    const { data: memberships } = await withSupabaseTimeout(
      adminSupabase
        .from("lobby_members")
        .select("lobby_id")
        .eq("user_id", userId)
        .order("joined_at", { ascending: false })
        .limit(50)
    );

    if (!memberships || memberships.length === 0) return null;

    const lobbyIds = memberships.map((m) => m.lobby_id);

    let query = adminSupabase
      .from("lobbies")
      .select("code, status, mode")
      .in("id", lobbyIds)
      .neq("status", "done");
    if (mode) query = query.eq("mode", mode);

    const { data: lobby } = await withSupabaseTimeout(
      query.order("last_active_at", { ascending: false }).limit(1).maybeSingle()
    );

    if (!lobby) return null;
    return {
      code: lobby.code,
      status: lobby.status as Lobby["status"],
      mode: (lobby.mode as LobbyMode) ?? "roulette",
    };
  } catch {
    return null;
  }
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

export function closeLobby(lobbyId: string, endedAt = new Date().toISOString()) {
  return adminSupabase
    .from("lobbies")
    .update({ status: "done", ended_at: endedAt } as any)
    .eq("id", lobbyId);
}

// excludeIds must cover every lobby with a pending, undetected PGCR apply
// (see getLobbyIdsAwaitingDetection) - last_active_at is only ever set at
// apply time and never refreshed while a client waits for detection, so an
// idle cutoff alone can't tell "abandoned" apart from "match still in
// progress, nobody has the tab open." Closing one of those marks it done and
// permanently excludes it from the detect-games cron, silently losing the
// match's stats.
export function closeIdleLobbies(
  idleCutoff: string,
  endedAt = new Date().toISOString(),
  excludeIds: string[] = []
) {
  let query = adminSupabase
    .from("lobbies")
    .update({ status: "done", ended_at: endedAt } as any)
    .neq("status", "done")
    .lt("last_active_at", idleCutoff);
  if (excludeIds.length) {
    query = query.notIn("id", excludeIds);
  }
  return query;
}

export type PendingApply = { lobbyId: string; roundId: string; appliedAt: string };

// Lobbies with an apply in the last 3 hours but no game_session recorded
// after it - i.e. still awaiting PGCR detection. Shared by detect-games
// (which processes them) and cleanup-lobbies/detect-games' own idle-close
// (which must never mark one of these "done" out from under detection).
export async function getLobbyIdsAwaitingDetection(cutoff: string): Promise<{
  pending: PendingApply[];
  error: { message: string } | null;
  stage: "pending_applies" | "existing_sessions" | null;
}> {
  const { data: pendingApplies, error: pendingAppliesError } = await adminSupabase
    .from("roll_history")
    .select("lobby_id, round_id, applied_at")
    .not("applied_at", "is", null)
    .gte("applied_at", cutoff)
    .order("applied_at", { ascending: false })
    .limit(500);

  if (pendingAppliesError) {
    return { pending: [], error: pendingAppliesError, stage: "pending_applies" };
  }
  if (!pendingApplies?.length) return { pending: [], error: null, stage: null };

  const byLobby = new Map<string, { round_id: string; applied_at: string }>();
  for (const row of pendingApplies) {
    if (!byLobby.has(row.lobby_id)) {
      byLobby.set(row.lobby_id, { round_id: row.round_id, applied_at: row.applied_at });
    }
  }

  const lobbyIds = [...byLobby.keys()];
  const { data: existingSessions, error: existingSessionsError } = await adminSupabase
    .from("game_sessions")
    .select("lobby_id, played_at")
    .in("lobby_id", lobbyIds);

  if (existingSessionsError) {
    return { pending: [], error: existingSessionsError, stage: "existing_sessions" };
  }

  const pending: PendingApply[] = [];
  for (const [lobbyId, { round_id, applied_at }] of byLobby) {
    const hasSession = existingSessions?.some(
      (s) => s.lobby_id === lobbyId && s.played_at >= applied_at
    );
    if (!hasSession) pending.push({ lobbyId, roundId: round_id, appliedAt: applied_at });
  }
  return { pending, error: null, stage: null };
}

export async function rotateCaptain(lobbyId: string): Promise<void> {
  const members = (await getLobbyMembers(lobbyId)).filter((m) => !m.is_spectator);
  if (members.length < 2) return;

  // lobbies.captain_user_id is the source of truth, not lobby_members.is_captain.
  // The flags are derived state that this very function rewrites in three
  // non-transactional steps, so reading them first would make a retry after a
  // partial failure advance from a half-written state and skip a player.
  // captain_user_id is written last, so it still names the pre-rotation captain
  // until the whole rotation has landed - which is exactly what makes a retry
  // idempotent. It also absorbs the is_captain desync a rejoin used to cause
  // (see joinLobby).
  const { data: lobby } = await adminSupabase
    .from("lobbies")
    .select("captain_user_id")
    .eq("id", lobbyId)
    .single();

  let currentCaptainIdx = members.findIndex((m) => m.user_id === lobby?.captain_user_id);
  if (currentCaptainIdx === -1) {
    // captain_user_id names nobody currently in the lobby (the captain left,
    // or an old row predates it). Fall back to the flag; index 0 only if that
    // is absent too, which at least keeps rotation moving.
    currentCaptainIdx = members.findIndex((m) => m.is_captain);
  }
  const nextIdx = (currentCaptainIdx + 1) % members.length;
  const nextCaptain = members[nextIdx];

  await assignCaptain(lobbyId, nextCaptain);
}

/**
 * Make one specific member the captain. Shared by rotateCaptain and the manual
 * hand-off in /api/lobby/set-captain, so both get the same error handling.
 *
 * These three writes are not a transaction, and their errors must be checked:
 * supabase-js resolves with { error } rather than throwing. A swallowed failure
 * between the clear and the set leaves NOBODY flagged captain, so no client
 * renders the roll controls and the round is stuck until someone reloads into
 * the same broken state.
 *
 * Throwing makes a partial failure retryable rather than silent. For
 * rotateCaptain the retry is safe because it derives the current captain from
 * lobbies.captain_user_id, which is written LAST here - so until the whole
 * hand-off lands, a re-run still picks the same target instead of skipping a
 * player. Keep captain_user_id last for that reason.
 */
export async function assignCaptain(
  lobbyId: string,
  nextCaptain: { id: string; user_id: string }
): Promise<void> {
  const { error: clearErr } = await adminSupabase
    .from("lobby_members")
    .update({ is_captain: false })
    .eq("lobby_id", lobbyId);

  if (clearErr) throw new Error(clearErr.message ?? "Failed to clear captain flags");

  const { error: setErr } = await adminSupabase
    .from("lobby_members")
    .update({ is_captain: true })
    .eq("id", nextCaptain.id);

  if (setErr) throw new Error(setErr.message ?? "Failed to assign the next captain");

  const { error: lobbyUpdErr } = await adminSupabase
    .from("lobbies")
    .update({ captain_user_id: nextCaptain.user_id })
    .eq("id", lobbyId);

  if (lobbyUpdErr) throw new Error(lobbyUpdErr.message ?? "Failed to record the next captain");
}
