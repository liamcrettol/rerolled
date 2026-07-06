// Draft mode data-access (#264). Persists the pure state machine in
// lib/draft/session.ts to Supabase: one row per pick, one session row per
// lobby's in-progress draft.

import { adminSupabase } from "@/lib/supabase/admin";
import {
  createDraftState,
  applyPick as applyPickPure,
  getCurrentTurn,
  isDraftComplete,
  type DraftState,
  type DraftPick,
} from "./session";
import type { WeaponSlot } from "@/types/bungie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = typeof adminSupabase;

export interface DraftSessionRow {
  id: string;
  lobbyId: string;
  status: "picking" | "completed" | "abandoned";
}

export interface StartDraftResult {
  ok: boolean;
  sessionId?: string;
  error?: string;
}

/**
 * Starts a draft session for a lobby from its current non-spectator members.
 * Turn order is join order (stable, deterministic, no captain favoritism).
 */
export async function startDraftSession(
  lobbyId: string,
  db: Db = adminSupabase
): Promise<StartDraftResult> {
  const { data: members, error: membersError } = await db
    .from("lobby_members")
    .select("user_id")
    .eq("lobby_id", lobbyId)
    .eq("is_spectator", false)
    .order("joined_at", { ascending: true });

  if (membersError) return { ok: false, error: membersError.message };

  const playerOrder = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (playerOrder.length < 2) {
    return { ok: false, error: "Draft needs at least 2 fireteam members so someone can pick for you" };
  }

  const { data: session, error: insertError } = await db
    .from("draft_sessions")
    .insert({
      lobby_id: lobbyId,
      status: "picking",
      player_order: playerOrder,
      skipped_user_ids: [],
    })
    .select()
    .single();

  if (insertError || !session) {
    return { ok: false, error: insertError?.message ?? "Failed to start draft" };
  }

  return { ok: true, sessionId: session.id };
}

async function loadState(
  sessionId: string,
  db: Db
): Promise<{ state: DraftState; lobbyId: string; status: string } | null> {
  const { data: session } = await db
    .from("draft_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return null;

  const { data: pickRows } = await db
    .from("draft_picks")
    .select("*")
    .eq("session_id", sessionId)
    .order("pick_number", { ascending: true });

  const state = createDraftState(session.player_order, session.skipped_user_ids ?? []);
  const picks: DraftPick[] = (pickRows ?? []).map((row) => ({
    forUserId: row.for_user_id,
    pickedByUserId: row.picked_by_user_id,
    slot: row.slot as WeaponSlot,
    itemHash: row.item_hash,
    pickNumber: row.pick_number,
  }));

  return { state: { ...state, picks }, lobbyId: session.lobby_id, status: session.status };
}

export interface DraftStateResult {
  ok: boolean;
  error?: string;
  state?: DraftState;
  currentTurn?: ReturnType<typeof getCurrentTurn>;
  complete?: boolean;
  status?: string;
}

export async function getDraftState(
  sessionId: string,
  db: Db = adminSupabase
): Promise<DraftStateResult> {
  const loaded = await loadState(sessionId, db);
  if (!loaded) return { ok: false, error: "Draft session not found" };
  return {
    ok: true,
    state: loaded.state,
    currentTurn: getCurrentTurn(loaded.state),
    complete: isDraftComplete(loaded.state),
    status: loaded.status,
  };
}

export interface RecordPickResult {
  ok: boolean;
  error?: string;
  complete?: boolean;
}

export async function recordPick(
  sessionId: string,
  pickedByUserId: string,
  itemHash: number,
  pool: Partial<Record<WeaponSlot, number[]>> | undefined,
  db: Db = adminSupabase
): Promise<RecordPickResult> {
  const loaded = await loadState(sessionId, db);
  if (!loaded) return { ok: false, error: "Draft session not found" };
  if (loaded.status !== "picking") return { ok: false, error: "This draft is no longer active" };

  const result = applyPickPure(loaded.state, pickedByUserId, itemHash, pool);
  if (!result.ok) return { ok: false, error: result.error };

  const { error: insertError } = await db.from("draft_picks").insert({
    session_id: sessionId,
    for_user_id: result.pick.forUserId,
    picked_by_user_id: result.pick.pickedByUserId,
    slot: result.pick.slot,
    item_hash: result.pick.itemHash,
    pick_number: result.pick.pickNumber,
  });
  if (insertError) return { ok: false, error: insertError.message };

  const complete = isDraftComplete(result.state);
  if (complete) {
    await db
      .from("draft_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  return { ok: true, complete };
}

/** Finds the in-progress ("picking") draft session for a lobby, if any. */
export async function getActiveDraftSessionId(
  lobbyId: string,
  db: Db = adminSupabase
): Promise<string | null> {
  const { data } = await db
    .from("draft_sessions")
    .select("id")
    .eq("lobby_id", lobbyId)
    .eq("status", "picking")
    .maybeSingle();
  return data?.id ?? null;
}
