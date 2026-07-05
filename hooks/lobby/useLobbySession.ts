"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  mergeSlot,
  upsertMember,
  updateMember,
  removeMemberById,
} from "@/lib/lobby/realtimeState";
import type { Lobby, LobbyMember, LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

// Core lobby session state (#224): the lobby row, members, loadout slots and
// current round, kept in ONE reducer so the realtime channel callback can
// dispatch without stale-closure reads — this replaces the old pattern of a
// separate useState per field plus a mirror ref for everything the channel
// handler needed.

interface SessionState {
  lobbyData: Lobby;
  members: LobbyMember[];
  slots: LobbyLoadoutSlot[];
  roundId: string | null;
}

type SessionAction =
  | { type: "lobbyUpdated"; lobby: Lobby }
  | { type: "memberUpsert"; member: LobbyMember }
  | { type: "memberUpdate"; member: LobbyMember }
  | { type: "memberRemove"; id: string }
  | { type: "slotMerged"; slot: LobbyLoadoutSlot }
  | { type: "roundLoaded"; roundId: string; slots: LobbyLoadoutSlot[] | null }
  | { type: "roundAdvanced" }
  | { type: "seedSlots"; slots: LobbyLoadoutSlot[] };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "lobbyUpdated":
      return { ...state, lobbyData: action.lobby };
    case "memberUpsert":
      return { ...state, members: upsertMember(state.members, action.member) };
    case "memberUpdate":
      return { ...state, members: updateMember(state.members, action.member) };
    case "memberRemove":
      return { ...state, members: removeMemberById(state.members, action.id) };
    case "slotMerged":
      // Round guard lives here so a dispatch can never apply a stale round's slot.
      if (!state.roundId || action.slot.round_id !== state.roundId) return state;
      return { ...state, slots: mergeSlot(state.slots, action.slot) };
    case "roundLoaded":
      return {
        ...state,
        roundId: action.roundId,
        // A null slot list means the query errored — leave slots untouched
        // (matches the old behavior of only setting on a successful load).
        slots: action.slots ?? state.slots,
      };
    case "roundAdvanced":
      return { ...state, slots: [] };
    case "seedSlots": {
      // If a real roll already landed (via realtime), don't clobber it.
      if (state.slots.some((p) => p.item_hash !== 0)) return state;
      const others = state.slots.filter((p) => !action.slots.some((x) => x.slot === p.slot));
      return { ...state, slots: [...others, ...action.slots] };
    }
  }
}

export interface LobbySessionCallbacks {
  /** A real (non-wildcard) weapon landed in a slot — via realtime or round load. */
  onSlotRolled?: (slot: WeaponSlot, hash: number) => void;
  /** The captain broadcast an Apply — opted-in members may auto-apply. */
  onCaptainApply?: () => void;
  /** The round advanced (non-null → different non-null): reset per-round state. */
  onRoundAdvance?: () => void;
  /** A round's persisted slots loaded — reconstruct wildcard state etc. */
  onRoundLoaded?: (slots: LobbyLoadoutSlot[]) => void;
}

export function useLobbySession(
  lobby: Lobby,
  initialMembers: LobbyMember[],
  currentUserId: string,
  callbacks: LobbySessionCallbacks
) {
  const supabase = useMemo(() => createClient(), []);
  const [state, dispatch] = useReducer(sessionReducer, {
    lobbyData: lobby,
    members: initialMembers,
    slots: [],
    roundId: null,
  });

  // Latest-callbacks ref: the channel handlers below live for the lobby's
  // lifetime, but the component re-creates its callbacks every render — this
  // single ref replaces the old per-value mirror refs.
  const cbRef = useRef(callbacks);
  useEffect(() => {
    cbRef.current = callbacks;
  }, [callbacks]);

  // The slot handler needs the current round to guard BEFORE side effects
  // (recordRoll); the reducer re-checks on dispatch.
  const roundIdRef = useRef<string | null>(null);
  useEffect(() => {
    roundIdRef.current = state.roundId;
  }, [state.roundId]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Clear per-round state when the round actually advances (non-null → different
  // non-null). Declared before the round-load effect to preserve run order.
  const prevRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.roundId && prevRoundIdRef.current && state.roundId !== prevRoundIdRef.current) {
      dispatch({ type: "roundAdvanced" });
      cbRef.current.onRoundAdvance?.();
    }
    prevRoundIdRef.current = state.roundId;
  }, [state.roundId]);

  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobby.id}` },
        (payload) => dispatch({ type: "lobbyUpdated", lobby: payload.new as Lobby })
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => dispatch({ type: "memberUpsert", member: payload.new as LobbyMember })
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => dispatch({ type: "memberUpdate", member: payload.new as LobbyMember })
      )
      .on(
        "postgres_changes",
        // DELETE without a filter: Supabase only includes the PK (id) in payload.old
        // unless REPLICA IDENTITY FULL is set (see migration 011). We filter by checking
        // if the deleted id is actually in our current members list.
        { event: "DELETE", schema: "public", table: "lobby_members" },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) dispatch({ type: "memberRemove", id: deletedId });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lobby_loadout_slots" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const s = payload.new as LobbyLoadoutSlot;
            if (!roundIdRef.current || s.round_id !== roundIdRef.current) return;
            if (s.item_hash !== 0) cbRef.current.onSlotRolled?.(s.slot as WeaponSlot, s.item_hash);
            dispatch({ type: "slotMerged", slot: s });
          }
        }
      )
      .on("broadcast", { event: "captain_apply" }, () => {
        cbRef.current.onCaptainApply?.();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [lobby.id, supabase]);

  // Load the current round's id + persisted slots whenever the round number moves.
  useEffect(() => {
    async function loadCurrentRound() {
      const { data: round } = await supabase
        .from("lobby_rounds")
        .select("id")
        .eq("lobby_id", lobby.id)
        .eq("round_number", state.lobbyData.current_round)
        .single();
      if (round) {
        const { data: existingSlots } = await supabase
          .from("lobby_loadout_slots")
          .select("*")
          .eq("round_id", round.id);
        dispatch({ type: "roundLoaded", roundId: round.id, slots: existingSlots ?? null });
        if (existingSlots) {
          cbRef.current.onRoundLoaded?.(existingSlots);
          for (const s of existingSlots) {
            if (s.item_hash !== 0) cbRef.current.onSlotRolled?.(s.slot as WeaponSlot, s.item_hash);
          }
        }
      }
    }
    loadCurrentRound();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id, state.lobbyData.current_round]);

  /** Locally reflect a seeded loadout (captain's equipped guns) without waiting
   *  on the realtime echo; ignored if a real roll already landed. */
  const seedSlots = useCallback((seeded: LobbyLoadoutSlot[]) => {
    if (seeded.length > 0) dispatch({ type: "seedSlots", slots: seeded });
  }, []);

  /** Captain's Apply triggers auto-apply for opted-in players via broadcast. */
  const sendCaptainApply = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "captain_apply", payload: {} });
  }, []);

  const me = state.members.find((m) => m.user_id === currentUserId);
  const isCaptain = me?.is_captain ?? false;
  const isSpectator = me?.is_spectator ?? false;
  const isHost = state.lobbyData.host_user_id === currentUserId;

  return {
    lobbyData: state.lobbyData,
    members: state.members,
    slots: state.slots,
    roundId: state.roundId,
    isCaptain,
    isSpectator,
    isHost,
    seedSlots,
    sendCaptainApply,
  };
}
