// Draft mode (#264, part of #237 Phase 3): the fireteam picks/bans your guns.
//
// V1 rule, kept intentionally narrow: turn order determines whose slot is
// being filled ("the subject"), but the subject can't pick their own weapon —
// any other drafting member fills it for them. This is pure state so it can
// be unit tested without touching Supabase; lib/draft/service.ts persists it.

import type { WeaponSlot } from "@/types/bungie";

export const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];

export interface DraftPick {
  forUserId: string;
  pickedByUserId: string;
  slot: WeaponSlot;
  itemHash: number;
  pickNumber: number;
}

export interface DraftTurn {
  forUserId: string;
  slot: WeaponSlot;
  pickNumber: number;
}

export interface DraftConfig {
  /** Stable turn order of the players being drafted for. */
  playerOrder: string[];
  slotOrder?: WeaponSlot[];
}

export interface DraftState {
  config: DraftConfig;
  picks: DraftPick[];
  /**
   * Players who disconnected before the draft started — their subject turns
   * are skipped entirely and they finish the draft with an incomplete
   * loadout. Decided at creation time; not safe to mutate mid-draft (see
   * buildTurnSequence).
   */
  skippedUserIds: string[];
}

export function createDraftState(
  playerOrder: string[],
  skippedUserIds: string[] = []
): DraftState {
  if (playerOrder.length < 2) {
    throw new Error("Draft requires at least 2 players so someone else can pick for you");
  }
  return {
    config: { playerOrder, slotOrder: SLOT_ORDER },
    picks: [],
    skippedUserIds,
  };
}

/**
 * The full slot-major turn sequence: every player's kinetic pick, then every
 * player's energy pick, then power. Recomputed from `skippedUserIds` + the
 * configured order every time — do NOT change `skippedUserIds` after picks
 * exist, since `getCurrentTurn` indexes into this by `picks.length` and a
 * changed skip set shifts every turn after it.
 */
export function buildTurnSequence(state: DraftState): DraftTurn[] {
  const slots = state.config.slotOrder ?? SLOT_ORDER;
  const skipped = new Set(state.skippedUserIds);
  const eligible = state.config.playerOrder.filter((id) => !skipped.has(id));
  const turns: DraftTurn[] = [];
  let pickNumber = 1;
  for (const slot of slots) {
    for (const forUserId of eligible) {
      turns.push({ forUserId, slot, pickNumber: pickNumber++ });
    }
  }
  return turns;
}

export function getCurrentTurn(state: DraftState): DraftTurn | null {
  return buildTurnSequence(state)[state.picks.length] ?? null;
}

export function isDraftComplete(state: DraftState): boolean {
  return getCurrentTurn(state) === null;
}

export type ApplyPickResult =
  | { ok: true; state: DraftState; pick: DraftPick }
  | { ok: false; error: string };

/**
 * `pool`, if provided, maps slot -> allowed item hashes (the shared
 * intersection pool, same source as roulette). A slot key present in `pool`
 * is enforced; an omitted slot key is left unvalidated (caller's choice).
 */
export function applyPick(
  state: DraftState,
  pickedByUserId: string,
  itemHash: number,
  pool?: Partial<Record<WeaponSlot, Set<number> | number[]>>
): ApplyPickResult {
  const turn = getCurrentTurn(state);
  if (!turn) return { ok: false, error: "Draft is already complete" };

  if (!state.config.playerOrder.includes(pickedByUserId)) {
    return { ok: false, error: "Only fireteam members in this draft can pick" };
  }
  if (state.skippedUserIds.includes(pickedByUserId)) {
    return { ok: false, error: "Disconnected players can't make picks" };
  }
  if (pickedByUserId === turn.forUserId) {
    return { ok: false, error: "You can't pick your own weapon — a teammate has to pick for you" };
  }
  if (pool) {
    const allowed = pool[turn.slot];
    if (allowed !== undefined) {
      const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
      if (!allowedSet.has(itemHash)) {
        return { ok: false, error: "That weapon isn't in the shared pool for this slot" };
      }
    }
  }

  const pick: DraftPick = {
    forUserId: turn.forUserId,
    pickedByUserId,
    slot: turn.slot,
    itemHash,
    pickNumber: turn.pickNumber,
  };

  return { ok: true, state: { ...state, picks: [...state.picks, pick] }, pick };
}

export function getPicksForUser(
  state: DraftState,
  userId: string
): Partial<Record<WeaponSlot, number>> {
  const result: Partial<Record<WeaponSlot, number>> = {};
  for (const pick of state.picks) {
    if (pick.forUserId === userId) result[pick.slot] = pick.itemHash;
  }
  return result;
}

export function isUserLoadoutComplete(state: DraftState, userId: string): boolean {
  const slots = state.config.slotOrder ?? SLOT_ORDER;
  const picks = getPicksForUser(state, userId);
  return slots.every((s) => picks[s] !== undefined);
}
