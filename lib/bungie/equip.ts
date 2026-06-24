import { bungiePost } from "./client";
import { getWeaponDefinitions } from "./definitions";
import type { WeaponSlot } from "@/types/bungie";
import type { ApplyResult } from "@/types/lobby";
import type { RawWeapon } from "./rawInventory";

// Constants
const EXOTIC_TIER_TYPE = 6;
const LEGENDARY_TIER_TYPE = 5;

// Helper function to determine if a weapon is exotic
function isExotic(tierType: number): boolean {
  return tierType === EXOTIC_TIER_TYPE;
}

// Find any exotics already equipped in different slots than the new weapons
function findConflictingExotics(
  newWeapons: WeaponToApply[],
  roster: RawWeapon[]
): Map<WeaponSlot, RawWeapon> {
  const conflictingExotics = new Map<WeaponSlot, RawWeapon>();

  for (const newWeapon of newWeapons) {
    // Look up the new weapon in the roster to get its tierType
    const newWeaponData = roster.find(
      (w) => w.itemInstanceId === newWeapon.itemInstanceId
    );

    // Skip non-exotics - no conflict possible
    if (!newWeaponData?.tierType || !isExotic(newWeaponData.tierType)) continue;

    // Find equipped exotics in different slots
    for (const existingWeapon of roster) {
      if (
        existingWeapon.isEquipped &&
        existingWeapon.tierType &&
        isExotic(existingWeapon.tierType) &&
        existingWeapon.slot !== newWeapon.slot &&
        existingWeapon.location === "character"
      ) {
        conflictingExotics.set(existingWeapon.slot, existingWeapon);
      }
    }
  }

  return conflictingExotics;
}

// Find a legendary weapon in the given slot to swap in as replacement
function findLegendaryReplacement(
  slot: WeaponSlot,
  characterId: string,
  roster: RawWeapon[],
  excludeInstanceIds: Set<string>
): RawWeapon | null {
  return (
    roster.find(
      (w) =>
        w.slot === slot &&
        w.location === "character" &&
        w.characterId === characterId &&
        w.tierType !== undefined &&
        !isExotic(w.tierType) && // must be legendary or lower
        !w.isEquipped &&
        !excludeInstanceIds.has(w.itemInstanceId)
    ) ?? null
  );
}

// A transfer fails with this Bungie error code when the destination bucket is
// full (no room on the character for another weapon of that slot).
function isNoRoomError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("1642") || msg.includes("no room") || msg.includes("destinationfull");
}

interface TransferItemRequest {
  itemReferenceHash: number;
  stackSize: number;
  transferToVault: boolean;
  itemId: string;
  characterId: string;
  membershipType: number;
}

interface EquipItemsRequest {
  itemIds: string[];
  characterId: string;
  membershipType: number;
}

interface EquipItemsResponse {
  equipResults: Array<{
    itemInstanceId: string;
    equipStatus: number; // 1 = success
  }>;
}

export interface WeaponToApply {
  itemHash: number;
  itemInstanceId: string;
  slot: WeaponSlot;
  location: "character" | "vault" | "postmaster";
  characterId?: string;
  tierType?: number;
}

/**
 * Move a weapon from vault to the target character, then equip it.
 * If the weapon is already on the character, skip the transfer.
 */
export async function applyWeapons(
  weapons: WeaponToApply[],
  targetCharacterId: string,
  membershipType: number,
  accessToken: string,
  userId: string,
  displayName: string,
  // The player's full weapon list, used to auto-make-room (farming style) when
  // the target character's weapon slot is full.
  roster: RawWeapon[] = []
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  // Fetch weapon definitions to determine tierType for new weapons being equipped
  const uniqueHashes = new Set(weapons.map((w) => w.itemHash));
  const weaponDefs = await getWeaponDefinitions(Array.from(uniqueHashes));

  // Enrich weapons with tierType info
  const weaponsWithTierType = weapons.map((w) => ({
    ...w,
    tierType: weaponDefs.get(w.itemHash)?.tierType ?? LEGENDARY_TIER_TYPE,
  }));

  // Instances we must never shove to the vault to make room: the loadout itself.
  const loadoutInstanceIds = new Set(weapons.map((w) => w.itemInstanceId));
  // Track instances already moved to the vault this run so we don't pick them again.
  const movedToVault = new Set<string>();

  // Move one non-equipped, non-loadout weapon of this slot off the target
  // character into the vault, freeing a bucket slot. Returns false if none found.
  async function makeRoom(slot: WeaponSlot): Promise<boolean> {
    const candidate = roster.find(
      (w) =>
        w.slot === slot &&
        w.location === "character" &&
        w.characterId === targetCharacterId &&
        !w.isEquipped &&
        !loadoutInstanceIds.has(w.itemInstanceId) &&
        !movedToVault.has(w.itemInstanceId)
    );
    if (!candidate) return false;
    try {
      await bungiePost<unknown>(
        "/Destiny2/Actions/Items/TransferItem/",
        accessToken,
        {
          itemReferenceHash: candidate.itemHash,
          stackSize: 1,
          transferToVault: true,
          itemId: candidate.itemInstanceId,
          characterId: targetCharacterId,
          membershipType,
        } satisfies TransferItemRequest
      );
      movedToVault.add(candidate.itemInstanceId);
      return true;
    } catch {
      return false;
    }
  }

  async function moveToCharacter(weapon: WeaponToApply) {
    // Items on another character must first go to the vault
    if (weapon.location === "character" && weapon.characterId && weapon.characterId !== targetCharacterId) {
      await bungiePost<unknown>(
        "/Destiny2/Actions/Items/TransferItem/",
        accessToken,
        {
          itemReferenceHash: weapon.itemHash,
          stackSize: 1,
          transferToVault: true,
          itemId: weapon.itemInstanceId,
          characterId: weapon.characterId,
          membershipType,
        } satisfies TransferItemRequest
      );
    }
    // Move from vault to target character
    await bungiePost<unknown>(
      "/Destiny2/Actions/Items/TransferItem/",
      accessToken,
      {
        itemReferenceHash: weapon.itemHash,
        stackSize: 1,
        transferToVault: false,
        itemId: weapon.itemInstanceId,
        characterId: targetCharacterId,
        membershipType,
      } satisfies TransferItemRequest
    );
  }

  // Step 1.5: Handle exotic weapon conflicts
  // If any of the weapons being equipped are exotics, check if an exotic is already equipped
  // in a different slot and auto-swap it for a legendary
  const exoticConflicts = findConflictingExotics(weaponsWithTierType, roster);
  if (exoticConflicts.size > 0) {
    for (const [conflictSlot, conflictingExotic] of exoticConflicts) {
      // Find a legendary to swap in place of the conflicting exotic
      const replacement = findLegendaryReplacement(
        conflictSlot,
        targetCharacterId,
        roster,
        loadoutInstanceIds
      );

      if (!replacement) {
        // No legendary found to replace with - we can't auto-swap
        results.push({
          user_id: userId,
          display_name: displayName,
          slot: conflictSlot,
          item_hash: conflictingExotic.itemHash,
          success: false,
          error: `Cannot auto-swap exotic - no legendary weapon available in ${conflictSlot} slot`,
        });
        continue;
      }

      // Unequip the conflicting exotic and equip the legendary replacement
      try {
        await bungiePost<EquipItemsResponse>(
          "/Destiny2/Actions/Items/EquipItems/",
          accessToken,
          {
            itemIds: [replacement.itemInstanceId],
            characterId: targetCharacterId,
            membershipType,
          } satisfies EquipItemsRequest
        );
        // Successfully swapped - the exotic is now unequipped
      } catch (err) {
        results.push({
          user_id: userId,
          display_name: displayName,
          slot: conflictSlot,
          item_hash: conflictingExotic.itemHash,
          success: false,
          error: err instanceof Error ? err.message : "Failed to auto-swap conflicting exotic",
        });
      }
    }
  }

  // Step 1: move weapons to the target character (from vault or another character)
  for (const weapon of weapons) {
    const needsTransfer =
      weapon.location === "vault" ||
      (weapon.location === "character" && weapon.characterId !== targetCharacterId);

    if (!needsTransfer) continue;

    try {
      await moveToCharacter(weapon);
    } catch (err) {
      // Bucket full? Make room by vaulting a spare weapon of that slot, then retry.
      if (isNoRoomError(err) && (await makeRoom(weapon.slot))) {
        try {
          await moveToCharacter(weapon);
          continue; // success on retry
        } catch (retryErr) {
          err = retryErr;
        }
      }
      const friendly = isNoRoomError(err)
        ? "Inventory full and no spare weapon to move - clear a slot, then Apply again"
        : err instanceof Error ? err.message : "Transfer failed";
      results.push({
        user_id: userId,
        display_name: displayName,
        slot: weapon.slot,
        item_hash: weapon.itemHash,
        success: false,
        error: friendly,
      });
    }
  }

  // Step 2: equip all three at once
  const itemIdsToEquip = weaponsWithTierType
    .filter(
      (w) =>
        !results.find((r) => r.slot === w.slot && r.success === false)
    )
    .map((w) => w.itemInstanceId);

  if (itemIdsToEquip.length === 0) return results;

  try {
    const equipRes = await bungiePost<EquipItemsResponse>(
      "/Destiny2/Actions/Items/EquipItems/",
      accessToken,
      {
        itemIds: itemIdsToEquip,
        characterId: targetCharacterId,
        membershipType,
      } satisfies EquipItemsRequest
    );

    for (const weapon of weaponsWithTierType) {
      if (results.find((r) => r.slot === weapon.slot)) continue;
      const equipResult = equipRes.equipResults.find(
        (r) => r.itemInstanceId === weapon.itemInstanceId
      );
      results.push({
        user_id: userId,
        display_name: displayName,
        slot: weapon.slot,
        item_hash: weapon.itemHash,
        success: equipResult?.equipStatus === 1,
        error:
          equipResult?.equipStatus !== 1
            ? `Equip status: ${equipResult?.equipStatus}`
            : undefined,
      });
    }
  } catch (err) {
    for (const weapon of weaponsWithTierType) {
      if (results.find((r) => r.slot === weapon.slot)) continue;
      results.push({
        user_id: userId,
        display_name: displayName,
        slot: weapon.slot,
        item_hash: weapon.itemHash,
        success: false,
        error: err instanceof Error ? err.message : "Equip failed",
      });
    }
  }

  return results;
}
