// Draft slot voting (#315). Lobbies with more than one non-spectator member
// vote on the 3 revealed candidates per slot instead of only the captain
// picking; the slot resolves as soon as every eligible member has voted, or a
// client-driven 30s timer calls resolveSlotTimeout as a fallback. Both paths
// share commitOfferedOption (lib/draft/optionsService.ts) so a resolved vote
// writes into lobby_loadout_slots exactly like a captain's instant pick does.

import { adminSupabase } from "@/lib/supabase/admin";
import { isValidPick } from "./options";
import { getOfferedOptions, commitOfferedOption } from "./optionsService";
import type { WeaponSlot } from "@/types/bungie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = typeof adminSupabase;

export interface VoteResult {
  ok: boolean;
  error?: string;
  resolved?: boolean;
  itemHash?: number;
}

async function isSlotCommitted(roundId: string, slot: WeaponSlot, db: Db): Promise<boolean> {
  const { data } = await db
    .from("lobby_loadout_slots")
    .select("id")
    .eq("round_id", roundId)
    .eq("slot", slot)
    .maybeSingle();
  return !!data;
}

// Random pick among whichever hashes are tied for the most votes - also
// covers the "nobody voted" timeout case, where every offered option is
// tied at zero.
function tally(offered: { item_hash: number }[], votes: { item_hash: number }[]): number {
  const counts = new Map<number, number>();
  for (const o of offered) counts.set(o.item_hash, 0);
  for (const v of votes) counts.set(v.item_hash, (counts.get(v.item_hash) ?? 0) + 1);

  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  const tied = [...counts.entries()].filter(([, c]) => c === max).map(([hash]) => hash);

  return tied[Math.floor(Math.random() * tied.length)];
}

export async function castVote(
  lobbyId: string,
  roundId: string,
  slot: WeaponSlot,
  itemHash: number,
  userId: string,
  db: Db = adminSupabase
): Promise<VoteResult> {
  const { data: members } = await db
    .from("lobby_members")
    .select("user_id, is_spectator")
    .eq("lobby_id", lobbyId);
  const roster = members ?? [];

  const me = roster.find((m) => m.user_id === userId);
  if (!me) return { ok: false, error: "You're not in this lobby. Try rejoining." };
  if (me.is_spectator) return { ok: false, error: "Spectators can't vote" };

  // Already resolved (e.g. by another member's vote or a timeout that raced
  // this request) - treat as success rather than erroring on a stale slot.
  if (await isSlotCommitted(roundId, slot, db)) return { ok: true, resolved: true };

  const offered = await getOfferedOptions(roundId, slot, db);
  if (!isValidPick(offered.map((o) => o.item_hash), itemHash)) {
    return { ok: false, error: "That weapon wasn't one of the revealed options" };
  }

  const { error: voteErr } = await db.from("lobby_draft_votes").upsert(
    { round_id: roundId, slot, voter_user_id: userId, item_hash: itemHash },
    { onConflict: "round_id,slot,voter_user_id" }
  );
  if (voteErr) return { ok: false, error: voteErr.message };

  const { data: votes } = await db
    .from("lobby_draft_votes")
    .select("item_hash")
    .eq("round_id", roundId)
    .eq("slot", slot);
  const castVotes = votes ?? [];

  const eligibleCount = roster.filter((m) => !m.is_spectator).length;
  if (castVotes.length < eligibleCount) return { ok: true, resolved: false };

  const winner = tally(offered, castVotes);
  const commit = await commitOfferedOption(roundId, slot, winner, offered, userId, db);
  if (!commit.ok) return { ok: false, error: commit.error };
  return { ok: true, resolved: true, itemHash: winner };
}

export async function resolveSlotTimeout(
  lobbyId: string,
  roundId: string,
  slot: WeaponSlot,
  userId: string,
  db: Db = adminSupabase
): Promise<VoteResult> {
  const { data: member } = await db
    .from("lobby_members")
    .select("user_id")
    .eq("lobby_id", lobbyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { ok: false, error: "You're not in this lobby. Try rejoining." };

  // Idempotent: every lobby member's client runs this timer, so whichever one
  // fires first wins and the rest are harmless no-ops.
  if (await isSlotCommitted(roundId, slot, db)) return { ok: true, resolved: true };

  const offered = await getOfferedOptions(roundId, slot, db);
  if (offered.length === 0) return { ok: false, error: "No options to resolve" };

  const { data: votes } = await db
    .from("lobby_draft_votes")
    .select("item_hash")
    .eq("round_id", roundId)
    .eq("slot", slot);

  const winner = tally(offered, votes ?? []);
  const commit = await commitOfferedOption(roundId, slot, winner, offered, userId, db);
  if (!commit.ok) return { ok: false, error: commit.error };
  return { ok: true, resolved: true, itemHash: winner };
}
