// Draft mode v2 (#266) data-access. Generates and persists the 3-candidate
// reveal per slot, then commits the captain's pick straight into
// lobby_loadout_slots — the same table/row-shape /api/roulette/roll writes —
// so the rest of the round (realtime slot merge, Apply) is untouched.

import { adminSupabase } from "@/lib/supabase/admin";
import { pickCandidates, isValidPick } from "./options";
import { getWeaponAmmoType } from "@/lib/bungie/definitions";
import type { WeaponSlot } from "@/types/bungie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = typeof adminSupabase;

interface WeaponDetail {
  name: string;
  icon: string;
  weaponType: string;
  damageType: string;
}

export interface DraftOption {
  position: number;
  itemHash: number;
  name: string;
  icon: string;
  weaponType: string;
  damageType: string;
}

export interface GenerateOptionsResult {
  ok: boolean;
  error?: string;
  options?: DraftOption[];
}

async function requireCaptain(
  lobbyId: string,
  userId: string,
  db: Db
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: lobby } = await db
    .from("lobbies")
    .select("captain_user_id")
    .eq("id", lobbyId)
    .single();
  if (lobby?.captain_user_id !== userId) {
    return { ok: false, error: "Only the captain can run the draft" };
  }
  return { ok: true };
}

// Destiny ammo economy: a fireteam loadout can't run two Special-ammo weapons
// across the Kinetic + Energy slots. Draft order is Kinetic → Energy → Power,
// so the only place a double-special can arise is the Energy reveal after a
// Special Kinetic pick — filter Special weapons out of the Energy pool in that
// case. (Power is always Heavy, so it's never affected.) Falls back to the
// unfiltered pool if the group happens to own no non-Special energy weapons, so
// the reveal still shows something rather than erroring.
async function applyAmmoRules(
  slot: WeaponSlot,
  roundId: string,
  pool: number[],
  db: Db
): Promise<number[]> {
  if (slot !== "energy") return pool;

  const { data: kineticPick } = await db
    .from("lobby_loadout_slots")
    .select("item_hash")
    .eq("round_id", roundId)
    .eq("slot", "kinetic")
    .maybeSingle();

  if (!kineticPick || getWeaponAmmoType(kineticPick.item_hash) !== "Special") {
    return pool;
  }

  const nonSpecial = pool.filter((h) => getWeaponAmmoType(h) !== "Special");
  return nonSpecial.length > 0 ? nonSpecial : pool;
}

export async function generateSlotOptions(
  lobbyId: string,
  roundId: string,
  slot: WeaponSlot,
  userId: string,
  db: Db = adminSupabase
): Promise<GenerateOptionsResult> {
  const captainCheck = await requireCaptain(lobbyId, userId, db);
  if (!captainCheck.ok) return { ok: false, error: captainCheck.error };

  const { data: poolRow } = await db
    .from("lobby_pools")
    .select("pool, weapon_details")
    .eq("lobby_id", lobbyId)
    .single();

  const pool: number[] = poolRow?.pool?.[slot] ?? [];
  const details: Record<string, WeaponDetail> = poolRow?.weapon_details ?? {};
  if (pool.length === 0) {
    return { ok: false, error: "No shared weapon pool cached yet — open the lobby's weapon browser first" };
  }

  const candidatePool = await applyAmmoRules(slot, roundId, pool, db);
  const candidates = pickCandidates(candidatePool);
  const options: DraftOption[] = candidates
    .map((itemHash, position) => {
      const detail = details[itemHash.toString()];
      if (!detail) return null;
      return { position, itemHash, name: detail.name, icon: detail.icon, weaponType: detail.weaponType, damageType: detail.damageType };
    })
    .filter((o): o is DraftOption => o !== null);

  if (options.length === 0) {
    return { ok: false, error: "Couldn't resolve weapon details for this slot's pool" };
  }

  // Replace rather than accumulate: re-rolling a slot's options overwrites the
  // previous 3, it doesn't append a second set.
  await db.from("lobby_draft_options").delete().eq("round_id", roundId).eq("slot", slot);
  await db.from("lobby_draft_options").insert(
    options.map((o) => ({
      round_id: roundId,
      slot,
      position: o.position,
      item_hash: o.itemHash,
      weapon_name: o.name,
      weapon_icon: o.icon,
      weapon_type: o.weaponType,
      damage_type: o.damageType,
    }))
  );

  return { ok: true, options };
}

export interface CommitPickResult {
  ok: boolean;
  error?: string;
}

export async function commitSlotPick(
  lobbyId: string,
  roundId: string,
  slot: WeaponSlot,
  itemHash: number,
  userId: string,
  db: Db = adminSupabase
): Promise<CommitPickResult> {
  const captainCheck = await requireCaptain(lobbyId, userId, db);
  if (!captainCheck.ok) return { ok: false, error: captainCheck.error };

  const { data: offered } = await db
    .from("lobby_draft_options")
    .select("item_hash, weapon_name, weapon_icon, weapon_type, damage_type")
    .eq("round_id", roundId)
    .eq("slot", slot);

  const offeredHashes = (offered ?? []).map((o) => o.item_hash);
  if (!isValidPick(offeredHashes, itemHash)) {
    return { ok: false, error: "That weapon wasn't one of the revealed options" };
  }

  const picked = offered?.find((o) => o.item_hash === itemHash);
  if (!picked) return { ok: false, error: "That weapon wasn't one of the revealed options" };

  const { error } = await db.from("lobby_loadout_slots").upsert(
    {
      round_id: roundId,
      slot,
      item_hash: picked.item_hash,
      weapon_name: picked.weapon_name,
      weapon_icon: picked.weapon_icon,
      weapon_type: picked.weapon_type,
      damage_type: picked.damage_type,
      locked_by_user_id: userId,
    },
    { onConflict: "round_id,slot" }
  );
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
