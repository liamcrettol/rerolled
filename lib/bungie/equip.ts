import { bungiePost } from "./client";
import { getWeaponDefinitions } from "./definitions";
import type { WeaponSlot } from "@/types/bungie";
import type { ApplyResult } from "@/types/lobby";
import type { RawWeapon } from "./rawInventory";

const INVENTORY_SLOT_LIMIT = 9;

export function isInventoryFull(characterId: string, roster: RawWeapon[]): boolean {
  const characterWeapons = roster.filter(
    (w) => w.location === "character" && w.characterId === characterId
  );
  return characterWeapons.length >= INVENTORY_SLOT_LIMIT;
}

export function findLastWeapon(
  characterId: string,
  roster: RawWeapon[],
  excludeInstanceIds: Set<string> = new Set()
): RawWeapon | null {
  const candidates = roster.filter(
    (w) =>
      w.location === "character" &&
      w.characterId === characterId &&
      !w.isEquipped &&
      !excludeInstanceIds.has(w.itemInstanceId)
  );
  // Return the last weapon in the filtered list (highest index)
  return candidates[candidates.length - 1] ?? null;
}

const EXOTIC_TIER_TYPE = 6;
const LEGENDARY_TIER_TYPE = 5;

function isExotic(tierType: number): boolean {
  return tierType === EXOTIC_TIER_TYPE;
}

// Find any exotics currently equipped in a different slot than the incoming exotic
function findConflictingExotics(
  newWeapons: WeaponToApply[],
  roster: RawWeapon[]
): Map<WeaponSlot, RawWeapon> {
  const conflictingExotics = new Map<WeaponSlot, RawWeapon>();

  for (const newWeapon of newWeapons) {
    const newWeaponData = roster.find((w) => w.itemInstanceId === newWeapon.itemInstanceId);
    if (!newWeaponData?.tierType || !isExotic(newWeaponData.tierType)) continue;

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

// Find the lowest-light legendary on the character in the given slot (excluding loadout items)
function findLegendaryReplacement(
  slot: WeaponSlot,
  characterId: string,
  roster: RawWeapon[],
  excludeInstanceIds: Set<string>
): RawWeapon | null {
  const candidates = roster.filter(
    (w) =>
      w.slot === slot &&
      w.location === "character" &&
      w.characterId === characterId &&
      w.tierType !== undefined &&
      !isExotic(w.tierType) &&
      !w.isEquipped &&
      !excludeInstanceIds.has(w.itemInstanceId)
  );
  return candidates.sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;
}

function isNoRoomError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("1642") || msg.includes("no room") || msg.includes("destinationfull");
}

export async function ensureInventorySpace(
  characterId: string,
  accessToken: string,
  membershipType: number,
  roster: RawWeapon[],
  userId: string | undefined = undefined,
  loadoutInstanceIds: Set<string> = new Set()
): Promise<InventoryClearResult[]> {
  const results: InventoryClearResult[] = [];

  // Check if inventory is full
  if (!isInventoryFull(characterId, roster)) {
    return results;
  }

  // Find the last unequipped weapon on the character to vault
  const weaponToVault = findLastWeapon(characterId, roster, loadoutInstanceIds);

  if (!weaponToVault) {
    return results;
  }

  // Attempt to vault the weapon
  try {
    await bungiePost<unknown>(
      "/Destiny2/Actions/Items/TransferItem/",
      accessToken,
      {
        itemReferenceHash: weaponToVault.itemHash,
        stackSize: 1,
        transferToVault: true,
        itemId: weaponToVault.itemInstanceId,
        characterId,
        membershipType,
      } satisfies TransferItemRequest
    );

    results.push({
      itemInstanceId: weaponToVault.itemInstanceId,
      itemHash: weaponToVault.itemHash,
      transferredToVault: true,
      success: true,
    });
  } catch (err) {
    // If vault transfer fails, return empty array per requirements
    results.push({
      itemInstanceId: weaponToVault.itemInstanceId,
      itemHash: weaponToVault.itemHash,
      transferredToVault: false,
      success: false,
      error: err instanceof Error ? err.message : "Failed to vault weapon",
    });
    return [];
  }

  return results;
}

interface TransferItemRequest {
  itemReferenceHash: number;
  stackSize: number;
  transferToVault: boolean;
  itemId: string;
  characterId: string;
  membershipType: number;
}

export interface InventoryClearResult {
  itemInstanceId: string;
  itemHash: number;
  transferredToVault?: boolean;
  success?: boolean;
  error?: string;
}

interface EquipItemsRequest {
  itemIds: string[];
  characterId: string;
  membershipType: number;
}

interface EquipItemsResponse {
  equipResults: Array<{
    itemInstanceId: string;
    equipStatus: number;
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

export async function applyWeapons(
  weapons: WeaponToApply[],
  targetCharacterId: string,
  membershipType: number,
  accessToken: string,
  userId: string,
  displayName: string,
  roster: RawWeapon[] = []
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  const uniqueHashes = new Set(weapons.map((w) => w.itemHash));
  const weaponDefs = await getWeaponDefinitions(Array.from(uniqueHashes));

  const weaponsWithTierType = weapons.map((w) => ({
    ...w,
    tierType: weaponDefs.get(w.itemHash)?.tierType ?? LEGENDARY_TIER_TYPE,
  }));

  const loadoutInstanceIds = new Set(weapons.map((w) => w.itemInstanceId));
  const movedToVault = new Set<string>();
  // Track weapons Step 1.5 already transferred so Step 1 doesn't re-transfer them
  const alreadyOnCharacter = new Set<string>();

  // Vault the lowest-light spare weapon in this slot to free a bucket slot
  async function makeRoom(slot: WeaponSlot): Promise<boolean> {
    const candidates = roster.filter(
      (w) =>
        w.slot === slot &&
        w.location === "character" &&
        w.characterId === targetCharacterId &&
        !w.isEquipped &&
        !loadoutInstanceIds.has(w.itemInstanceId) &&
        !movedToVault.has(w.itemInstanceId)
    );
    const candidate = candidates.sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;
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

  // Step 1.5: Resolve exotic slot conflicts before transferring anything.
  // If we're equipping an exotic and a different exotic is already equipped,
  // we must equip a legendary in the conflicting slot first.
  // When no spare legendary is on the character, use the loadout's own weapon
  // for that slot — transfer it now and mark it so Step 1 doesn't repeat the transfer.
  const exoticConflicts = findConflictingExotics(weaponsWithTierType, roster);

  for (const [conflictSlot, conflictingExotic] of exoticConflicts) {
    let replacement = findLegendaryReplacement(conflictSlot, targetCharacterId, roster, loadoutInstanceIds);

    if (!replacement) {
      // No spare on character — use the loadout's own non-exotic weapon for this slot
      const loadoutWeaponForSlot = weaponsWithTierType.find(
        (w) => w.slot === conflictSlot && !isExotic(w.tierType ?? LEGENDARY_TIER_TYPE)
      );

      if (loadoutWeaponForSlot) {
        try {
          // Make room first if the bucket is full
          try {
            await moveToCharacter(loadoutWeaponForSlot);
          } catch (transferErr) {
            if (isNoRoomError(transferErr) && (await makeRoom(conflictSlot))) {
              await moveToCharacter(loadoutWeaponForSlot);
            } else {
              throw transferErr;
            }
          }
          alreadyOnCharacter.add(loadoutWeaponForSlot.itemInstanceId);
          replacement = {
            itemHash: loadoutWeaponForSlot.itemHash,
            itemInstanceId: loadoutWeaponForSlot.itemInstanceId,
            slot: conflictSlot,
            location: "character",
            characterId: targetCharacterId,
            isEquipped: false,
            lightLevel: 0,
            tierType: loadoutWeaponForSlot.tierType,
          };
        } catch (err) {
          results.push({
            user_id: userId,
            display_name: displayName,
            slot: conflictSlot,
            item_hash: conflictingExotic.itemHash,
            success: false,
            error: err instanceof Error ? err.message : "Failed to transfer weapon to clear exotic conflict",
          });
          continue;
        }
      }
    }

    if (!replacement) {
      results.push({
        user_id: userId,
        display_name: displayName,
        slot: conflictSlot,
        item_hash: conflictingExotic.itemHash,
        success: false,
        error: `Cannot swap out exotic in ${conflictSlot} slot — no legendary available`,
      });
      continue;
    }

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
    } catch (err) {
      results.push({
        user_id: userId,
        display_name: displayName,
        slot: conflictSlot,
        item_hash: conflictingExotic.itemHash,
        success: false,
        error: err instanceof Error ? err.message : "Failed to swap out conflicting exotic",
      });
    }
  }

  // Step 1: Move remaining weapons to the target character
  for (const weapon of weapons) {
    if (alreadyOnCharacter.has(weapon.itemInstanceId)) continue;

    const needsTransfer =
      weapon.location === "vault" ||
      (weapon.location === "character" && weapon.characterId !== targetCharacterId);

    if (!needsTransfer) continue;

    try {
      await moveToCharacter(weapon);
    } catch (err) {
      if (isNoRoomError(err) && (await makeRoom(weapon.slot))) {
        try {
          await moveToCharacter(weapon);
          continue;
        } catch (retryErr) {
          err = retryErr;
        }
      }
      const friendly = isNoRoomError(err)
        ? "Inventory full and no spare weapon to move — clear a slot, then Apply again"
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

  // Step 2: Equip everything in one batch
  const itemIdsToEquip = weaponsWithTierType
    .filter((w) => !results.find((r) => r.slot === w.slot && r.success === false))
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
