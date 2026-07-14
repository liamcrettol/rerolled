import { bungiePost } from "./client";
import { getWeaponDefinitions, getWeaponGroupHashes } from "./definitions";
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

const SAFETY_VAULT_THRESHOLD = 0.5; // Never vault more than 50% of unequipped weapons

export function calculateVaultNeeded(
  characterId: string,
  roster: RawWeapon[],
  incomingWeaponCount: number,
  alreadyOnCharacter: Set<string> = new Set()
): number {
  const characterWeapons = roster.filter(
    (w) => w.location === "character" && w.characterId === characterId
  );

  const unequippedWeapons = characterWeapons.filter((w) => !w.isEquipped);
  const equippedWeapons = characterWeapons.filter((w) => w.isEquipped);

  // How many of the incoming weapons are already on this character?
  const incomingOnCharacter = roster.filter(
    (w) =>
      w.location === "character" &&
      w.characterId === characterId &&
      alreadyOnCharacter.has(w.itemInstanceId)
  ).length;

  // How many new weapons are coming from outside?
  const incomingFromOutside = incomingWeaponCount - incomingOnCharacter;

  if (incomingFromOutside <= 0) return 0;

  // Current capacity: equipped + unequipped
  // After adding incoming: equipped + unequipped + incoming
  // Max allowed: 9
  // So we need to vault: (equipped + unequipped + incoming) - 9
  const currentTotal = equippedWeapons.length + unequippedWeapons.length;
  const afterAdding = currentTotal + incomingFromOutside;
  const basicNeed = Math.max(0, afterAdding - INVENTORY_SLOT_LIMIT);

  // Apply safety threshold: never vault more than 50% of unequipped
  const maxSafeVault = Math.floor(unequippedWeapons.length * SAFETY_VAULT_THRESHOLD);
  const capped = Math.min(basicNeed, maxSafeVault);

  return Math.max(0, capped);
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

function findLowestLightWeapons(
  characterId: string,
  roster: RawWeapon[],
  count: number,
  excludeInstanceIds: Set<string> = new Set()
): RawWeapon[] {
  return roster
    .filter(
      (w) =>
        w.location === "character" &&
        w.characterId === characterId &&
        !w.isEquipped &&
        !excludeInstanceIds.has(w.itemInstanceId)
    )
    .sort((a, b) => a.lightLevel - b.lightLevel)
    .slice(0, count);
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
  incomingWeaponCount: number = 0,
  loadoutInstanceIds: Set<string> = new Set()
): Promise<InventoryClearResult[]> {
  const results: InventoryClearResult[] = [];

  // Determine how many weapons actually need to be vaulted
  const vaultNeeded = calculateVaultNeeded(
    characterId,
    roster,
    incomingWeaponCount,
    loadoutInstanceIds
  );

  if (vaultNeeded === 0) {
    return results; // No vaulting needed
  }

  // Find the lowest-light weapons to vault
  const weaponsToVault = findLowestLightWeapons(
    characterId,
    roster,
    vaultNeeded,
    loadoutInstanceIds
  );

  if (weaponsToVault.length === 0) {
    // No unequipped weapons available to vault - this shouldn't happen with safety threshold
    // but if it does, just return empty and let applyWeapons handle it with fallback logic
    return results;
  }

  // Vault each weapon in sequence, continue even if one fails
  for (const weapon of weaponsToVault) {
    try {
      await bungiePost<unknown>(
        "/Destiny2/Actions/Items/TransferItem/",
        accessToken,
        {
          itemReferenceHash: weapon.itemHash,
          stackSize: 1,
          transferToVault: true,
          itemId: weapon.itemInstanceId,
          characterId,
          membershipType,
        } satisfies TransferItemRequest
      );

      results.push({
        itemInstanceId: weapon.itemInstanceId,
        itemHash: weapon.itemHash,
        transferredToVault: true,
        success: true,
      });
    } catch (err) {
      // If a vault fails, note it but continue trying others
      results.push({
        itemInstanceId: weapon.itemInstanceId,
        itemHash: weapon.itemHash,
        transferredToVault: false,
        success: false,
        error: err instanceof Error ? err.message : "Failed to vault weapon",
      });
      // Continue trying to vault remaining weapons
    }
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

/**
 * Pick the cheapest-to-equip owned instance of a weapon: prefer one already on
 * the target character, then the vault, then another character; ties broken by
 * light level. A caller-preferred instanceId wins when the user owns it.
 */
export function findBestInstance(
  itemHash: number,
  weapons: RawWeapon[],
  targetCharacterId: string,
  preferredInstanceId?: string
): RawWeapon | null {
  // Any variant of the weapon counts (re-release / Adept / craftable): the
  // rolls browser and draft roll picker group a player's instances across the
  // whole weapon group (#68), so the copy they chose or favorited can carry a
  // different itemHash than the one that was rolled. Filtering on the exact
  // hash silently discarded those picks at apply time.
  const groupHashes = new Set(getWeaponGroupHashes(itemHash));
  const candidates = weapons.filter((w) => groupHashes.has(w.itemHash));
  if (candidates.length === 0) return null;

  if (preferredInstanceId) {
    const preferred = candidates.find((w) => w.itemInstanceId === preferredInstanceId);
    if (preferred) return preferred;
  }

  const transferCost = (w: RawWeapon) => {
    if (w.characterId === targetCharacterId) return 0;
    if (w.location === "vault") return 1;
    // A copy equipped on another character needs a swap-in equip over there
    // before Bungie will let it move at all, so it's the priciest source.
    return w.isEquipped ? 3 : 2;
  };

  return candidates.sort((a, b) => {
    const costDiff = transferCost(a) - transferCost(b);
    if (costDiff !== 0) return costDiff;
    // Same transfer cost: prefer the exact rolled hash over a variant.
    const exactDiff = Number(b.itemHash === itemHash) - Number(a.itemHash === itemHash);
    return exactDiff !== 0 ? exactDiff : b.lightLevel - a.lightLevel;
  })[0];
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

  const makeResult = (
    slot: WeaponSlot,
    itemHash: number,
    success: boolean,
    error?: string,
    errorDetail?: string
  ): ApplyResult => {
    const def = weaponDefs.get(itemHash);
    return {
      user_id: userId,
      display_name: displayName,
      slot,
      item_hash: itemHash,
      success,
      error,
      error_detail: errorDetail,
      weapon_name: def?.name,
      weapon_icon: def?.icon,
    };
  };

  const weaponsWithTierType = weapons.map((w) => ({
    ...w,
    tierType: weaponDefs.get(w.itemHash)?.tierType ?? LEGENDARY_TIER_TYPE,
  }));

  const loadoutInstanceIds = new Set(weapons.map((w) => w.itemInstanceId));
  const movedToVault = new Set<string>();
  // Track weapons Step 1.5 already transferred so Step 1 doesn't re-transfer them
  const alreadyOnCharacter = new Set<string>();

  // Vault the lowest-light unequipped weapon to free up a slot
  // First tries to find one in the target slot, then searches globally
  async function makeRoom(slot: WeaponSlot): Promise<boolean> {
    // First, try to find an unequipped weapon in the target slot
    let candidates = roster.filter(
      (w) =>
        w.slot === slot &&
        w.location === "character" &&
        w.characterId === targetCharacterId &&
        !w.isEquipped &&
        !loadoutInstanceIds.has(w.itemInstanceId) &&
        !movedToVault.has(w.itemInstanceId)
    );

    let candidate = candidates.sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;

    // If no unequipped weapon in slot, search globally for lowest-light unequipped weapon
    if (!candidate) {
      candidates = roster.filter(
        (w) =>
          w.location === "character" &&
          w.characterId === targetCharacterId &&
          !w.isEquipped &&
          !loadoutInstanceIds.has(w.itemInstanceId) &&
          !movedToVault.has(w.itemInstanceId)
      );
      candidate = candidates.sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;
    }

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

  // Bungie refuses to transfer an equipped item. When the copy we need is
  // equipped on ANOTHER character (say it's that character's only weapon in
  // the slot), free it by equipping a replacement over there first: a spare
  // already in that slot on the character if one exists, otherwise a stand-in
  // pulled from the vault.
  async function unequipOnSourceCharacter(weapon: WeaponToApply): Promise<void> {
    const source = roster.find((w) => w.itemInstanceId === weapon.itemInstanceId);
    if (!source?.isEquipped || !source.characterId || source.characterId === targetCharacterId) return;
    const sourceCharacterId = source.characterId;

    // Non-exotic spares first: the swap-in only needs to hold the bucket, and
    // a legendary can never trip the one-exotic rule on that character.
    let replacement =
      roster
        .filter(
          (w) =>
            w.slot === weapon.slot &&
            w.location === "character" &&
            w.characterId === sourceCharacterId &&
            !w.isEquipped &&
            !loadoutInstanceIds.has(w.itemInstanceId) &&
            !movedToVault.has(w.itemInstanceId)
        )
        .sort(
          (a, b) =>
            Number(isExotic(a.tierType ?? LEGENDARY_TIER_TYPE)) -
              Number(isExotic(b.tierType ?? LEGENDARY_TIER_TYPE)) ||
            a.lightLevel - b.lightLevel
        )[0] ?? null;

    if (!replacement) {
      // Nothing else in that bucket on the character: pull a stand-in from the vault.
      const standIn =
        roster
          .filter(
            (w) =>
              w.slot === weapon.slot &&
              w.location === "vault" &&
              !loadoutInstanceIds.has(w.itemInstanceId) &&
              !isExotic(w.tierType ?? LEGENDARY_TIER_TYPE)
          )
          .sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;
      if (!standIn) {
        throw new Error(
          `This copy is equipped on another character with nothing to swap in. Move another ${weapon.slot} weapon to that character, then Apply again.`
        );
      }
      await bungiePost<unknown>(
        "/Destiny2/Actions/Items/TransferItem/",
        accessToken,
        {
          itemReferenceHash: standIn.itemHash,
          stackSize: 1,
          transferToVault: false,
          itemId: standIn.itemInstanceId,
          characterId: sourceCharacterId,
          membershipType,
        } satisfies TransferItemRequest
      );
      replacement = standIn;
    }

    await bungiePost<EquipItemsResponse>(
      "/Destiny2/Actions/Items/EquipItems/",
      accessToken,
      {
        itemIds: [replacement.itemInstanceId],
        characterId: sourceCharacterId,
        membershipType,
      } satisfies EquipItemsRequest
    );
  }

  async function moveToCharacter(weapon: WeaponToApply) {
    if (weapon.location === "character" && weapon.characterId && weapon.characterId !== targetCharacterId) {
      await unequipOnSourceCharacter(weapon);
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
          results.push(
            makeResult(
              conflictSlot,
              conflictingExotic.itemHash,
              false,
              err instanceof Error ? err.message : "Failed to transfer weapon to clear exotic conflict",
              err instanceof Error ? err.message : undefined
            )
          );
          continue;
        }
      }
    }

    if (!replacement) {
      results.push(
        makeResult(
          conflictSlot,
          conflictingExotic.itemHash,
          false,
          `Cannot swap out exotic in ${conflictSlot} slot. No legendary available.`
        )
      );
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
      results.push(
        makeResult(
          conflictSlot,
          conflictingExotic.itemHash,
          false,
          err instanceof Error ? err.message : "Failed to swap out conflicting exotic",
          err instanceof Error ? err.message : undefined
        )
      );
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
      const raw = err instanceof Error ? err.message : "Transfer failed";
      const friendly = isNoRoomError(err)
        ? "Inventory full and no spare weapon to move. Clear a slot, then Apply again."
        : raw;
      results.push(makeResult(weapon.slot, weapon.itemHash, false, friendly, raw));
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
      results.push(
        makeResult(
          weapon.slot,
          weapon.itemHash,
          equipResult?.equipStatus === 1,
          equipResult?.equipStatus !== 1 ? `Equip status: ${equipResult?.equipStatus}` : undefined
        )
      );
    }
  } catch (err) {
    for (const weapon of weaponsWithTierType) {
      if (results.find((r) => r.slot === weapon.slot)) continue;
      results.push(
        makeResult(
          weapon.slot,
          weapon.itemHash,
          false,
          err instanceof Error ? err.message : "Equip failed",
          err instanceof Error ? err.message : undefined
        )
      );
    }
  }

  return results;
}
