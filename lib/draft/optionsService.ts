// Draft mode v2 (#266) data-access. Generates and persists the 3-candidate
// reveal per slot, then the fireteam vote (lib/draft/voteService.ts) commits
// the winner straight into lobby_loadout_slots — the same table/row-shape
// /api/roulette/roll writes — so the rest of the round (realtime slot merge,
// Apply) is untouched. Draft has no captain: the member who started the lobby
// is only special in that they click Reveal (requireStarter below).

import { adminSupabase } from "@/lib/supabase/admin";
import { pickCandidates, isValidPick } from "./options";
import { getWeaponAmmoType, getWeaponTierType } from "@/lib/bungie/definitions";
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

// Draft lobbies never rotate captain_user_id, so it is simply the member who
// started the draft. They aren't a captain: revealing each slot's candidates
// is their only special role, every pick is decided by the fireteam vote.
async function requireStarter(
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
    return { ok: false, error: "Only the player who started the draft can reveal options" };
  }
  return { ok: true };
}

// Draft pairs one Primary-ammo weapon with one Special-ammo weapon across the
// Kinetic and Energy slots. Kinetic may reveal either type; Energy then reveals
// the opposite of the committed Kinetic pick. Power is always Heavy. If the
// shared pool has no complementary weapon, keep the full pool as a fallback.
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

  if (!kineticPick) return pool;
  const kineticAmmo = getWeaponAmmoType(kineticPick.item_hash);
  if (kineticAmmo !== "Primary" && kineticAmmo !== "Special") return pool;

  const requiredEnergyAmmo = kineticAmmo === "Primary" ? "Special" : "Primary";
  const complementary = pool.filter((hash) => getWeaponAmmoType(hash) === requiredEnergyAmmo);
  return complementary.length > 0 ? complementary : pool;
}

// Destiny only permits one exotic weapon in a loadout. Filter the next reveal
// after an exotic has already been committed. If a pool contains only exotics,
// keep the reveal usable and let commit validation explain the conflict rather
// than returning an empty reveal.
async function applyExoticRules(
  slot: WeaponSlot,
  roundId: string,
  pool: number[],
  db: Db
): Promise<number[]> {
  const { data: committed } = await db
    .from("lobby_loadout_slots")
    .select("slot, item_hash")
    .eq("round_id", roundId);

  const hasExotic = (committed ?? []).some(
    (pick: { slot: WeaponSlot; item_hash: number }) => pick.slot !== slot && getWeaponTierType(pick.item_hash) === 6
  );
  if (!hasExotic) return pool;

  const nonExotic = pool.filter((hash) => getWeaponTierType(hash) !== 6);
  return nonExotic.length > 0 ? nonExotic : pool;
}

export async function generateSlotOptions(
  lobbyId: string,
  roundId: string,
  slot: WeaponSlot,
  userId: string,
  db: Db = adminSupabase
): Promise<GenerateOptionsResult> {
  const starterCheck = await requireStarter(lobbyId, userId, db);
  if (!starterCheck.ok) return { ok: false, error: starterCheck.error };

  const existingOptions = await getOfferedOptions(roundId, slot, db);
  if (existingOptions.length > 0) {
    return { ok: false, error: "Options have already been revealed for this slot" };
  }

  const { data: poolRow } = await db
    .from("lobby_pools")
    .select("pool, weapon_details")
    .eq("lobby_id", lobbyId)
    .single();

  const pool: number[] = poolRow?.pool?.[slot] ?? [];
  const details: Record<string, WeaponDetail> = poolRow?.weapon_details ?? {};
  if (pool.length === 0) {
    return { ok: false, error: "No shared weapon pool cached yet. Open the lobby's weapon browser first." };
  }

  const ammoSafePool = await applyAmmoRules(slot, roundId, pool, db);
  const candidatePool = await applyExoticRules(slot, roundId, ammoSafePool, db);
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

  const { error: insertError } = await db.from("lobby_draft_options").insert(
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
  if (insertError) {
    return { ok: false, error: insertError.message ?? "Failed to reveal draft options" };
  }

  return { ok: true, options };
}

export interface CommitPickResult {
  ok: boolean;
  error?: string;
}

interface OfferedOption {
  item_hash: number;
  weapon_name: string;
  weapon_icon: string;
  weapon_type: string;
  damage_type: string;
}

export async function getOfferedOptions(
  roundId: string,
  slot: WeaponSlot,
  db: Db = adminSupabase
): Promise<OfferedOption[]> {
  const { data } = await db
    .from("lobby_draft_options")
    .select("item_hash, weapon_name, weapon_icon, weapon_type, damage_type")
    .eq("round_id", roundId)
    .eq("slot", slot);
  return data ?? [];
}

// Shared by the vote-resolution and timeout paths (lib/draft/voteService.ts,
// #315) - both end up writing the same winning candidate into
// lobby_loadout_slots the same way.
export async function commitOfferedOption(
  roundId: string,
  slot: WeaponSlot,
  itemHash: number,
  offered: OfferedOption[],
  lockedByUserId: string,
  db: Db = adminSupabase
): Promise<CommitPickResult> {
  if (!isValidPick(offered.map((o) => o.item_hash), itemHash)) {
    return { ok: false, error: "That weapon wasn't one of the revealed options" };
  }

  const picked = offered.find((o) => o.item_hash === itemHash);
  if (!picked) return { ok: false, error: "That weapon wasn't one of the revealed options" };

  const { data: committed } = await db
    .from("lobby_loadout_slots")
    .select("slot, item_hash")
    .eq("round_id", roundId);
  const exoticAlreadyCommitted = (committed ?? []).some(
    (existing: { slot: WeaponSlot; item_hash: number }) => existing.slot !== slot && getWeaponTierType(existing.item_hash) === 6
  );
  if (exoticAlreadyCommitted && getWeaponTierType(picked.item_hash) === 6) {
    return { ok: false, error: "Only one exotic weapon can be equipped in a loadout" };
  }

  const { error } = await db.from("lobby_loadout_slots").upsert(
    {
      round_id: roundId,
      slot,
      item_hash: picked.item_hash,
      weapon_name: picked.weapon_name,
      weapon_icon: picked.weapon_icon,
      weapon_type: picked.weapon_type,
      damage_type: picked.damage_type,
      locked_by_user_id: lockedByUserId,
    },
    { onConflict: "round_id,slot" }
  );
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

