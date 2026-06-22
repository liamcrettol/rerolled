import { bungiePost } from "./client";
import type { WeaponSlot } from "@/types/bungie";
import type { ApplyResult } from "@/types/lobby";

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
  displayName: string
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];

  // Step 1: move weapons to the target character (from vault or another character)
  for (const weapon of weapons) {
    const needsTransfer =
      weapon.location === "vault" ||
      (weapon.location === "character" && weapon.characterId !== targetCharacterId);

    if (!needsTransfer) continue;

    try {
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

      // Now move from vault to target character
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
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Transfer failed";
      const friendly = raw.includes("1642") || raw.toLowerCase().includes("no room")
        ? "Inventory full — clear a weapon slot on your character first"
        : raw;
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
  const itemIdsToEquip = weapons
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

    for (const weapon of weapons) {
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
    for (const weapon of weapons) {
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
