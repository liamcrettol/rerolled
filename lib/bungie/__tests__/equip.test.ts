import { isInventoryFull, findLastWeapon, ensureInventorySpace } from "../equip";
import type { RawWeapon } from "../rawInventory";
import * as clientModule from "../client";

jest.mock("../client");

describe("isInventoryFull", () => {
  const mockWeapons = (count: number, location: "character" | "vault" = "character"): RawWeapon[] => {
    return Array.from({ length: count }, (_, i) => ({
      itemHash: 1000 + i,
      itemInstanceId: `instance-${i}`,
      slot: (["kinetic", "energy", "power"][i % 3]) as any,
      location,
      characterId: "test-char-id",
      isEquipped: false,
      lightLevel: 750,
      tierType: 5,
    }));
  };

  it("returns false when character has fewer than 9 weapons", () => {
    const weapons = mockWeapons(8);
    expect(isInventoryFull("test-char-id", weapons)).toBe(false);
  });

  it("returns true when character has 9 weapons", () => {
    const weapons = mockWeapons(9);
    expect(isInventoryFull("test-char-id", weapons)).toBe(true);
  });

  it("returns true when character has more than 9 weapons", () => {
    const weapons = mockWeapons(10);
    expect(isInventoryFull("test-char-id", weapons)).toBe(true);
  });

  it("ignores weapons not on the character", () => {
    const onCharacter = mockWeapons(5);
    const inVault = mockWeapons(5, "vault");
    const weapons = [...onCharacter, ...inVault];
    expect(isInventoryFull("test-char-id", weapons)).toBe(false);
  });

  it("counts equipped items toward inventory limit", () => {
    const weapons = mockWeapons(9);
    weapons[0].isEquipped = true;
    expect(isInventoryFull("test-char-id", weapons)).toBe(true);
  });
});

describe("findLastWeapon", () => {
  const mockWeapons = (characterId: string, count: number = 5): RawWeapon[] => {
    return Array.from({ length: count }, (_, i) => ({
      itemHash: 1000 + i,
      itemInstanceId: `instance-${i}`,
      slot: (["kinetic", "energy", "power"][i % 3]) as any,
      location: "character" as const,
      characterId,
      isEquipped: false,
      lightLevel: 750,
      tierType: 5,
    }));
  };

  it("returns the last unequipped weapon on character", () => {
    const weapons = mockWeapons("char-1", 3);
    const result = findLastWeapon("char-1", weapons);
    expect(result?.itemInstanceId).toBe("instance-2");
  });

  it("returns null when no weapons available on character", () => {
    const weapons = mockWeapons("char-1", 0);
    const result = findLastWeapon("char-1", weapons);
    expect(result).toBeNull();
  });

  it("ignores vault weapons", () => {
    const charWeapons = mockWeapons("char-1", 2);
    const vaultWeapons: RawWeapon[] = [
      {
        itemHash: 2000,
        itemInstanceId: "vault-weapon",
        slot: "kinetic",
        location: "vault",
        isEquipped: false,
        lightLevel: 700,
        tierType: 5,
      },
    ];
    const result = findLastWeapon("char-1", [...charWeapons, ...vaultWeapons]);
    expect(result?.itemInstanceId).toBe("instance-1");
  });

  it("ignores equipped weapons", () => {
    const weapons = mockWeapons("char-1", 3);
    weapons[2].isEquipped = true; // mark last as equipped
    const result = findLastWeapon("char-1", weapons);
    // Should return instance-1, not the equipped instance-2
    expect(result?.itemInstanceId).toBe("instance-1");
  });

  it("returns null when only equipped weapons exist", () => {
    const weapons = mockWeapons("char-1", 2);
    weapons.forEach(w => w.isEquipped = true);
    const result = findLastWeapon("char-1", weapons);
    expect(result).toBeNull();
  });

  it("excludes specified item instance IDs", () => {
    const weapons = mockWeapons("char-1", 3);
    const result = findLastWeapon(
      "char-1",
      weapons,
      new Set(["instance-2"])
    );
    // Should return instance-1, not the excluded instance-2
    expect(result?.itemInstanceId).toBe("instance-1");
  });
});

describe("ensureInventorySpace", () => {
  const mockWeapons = (characterId: string, count: number = 5): RawWeapon[] => {
    return Array.from({ length: count }, (_, i) => ({
      itemHash: 1000 + i,
      itemInstanceId: `instance-${i}`,
      slot: (["kinetic", "energy", "power"][i % 3]) as any,
      location: "character" as const,
      characterId,
      isEquipped: false,
      lightLevel: 750 - i * 10,
      tierType: 5,
    }));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (clientModule.bungiePost as jest.Mock).mockResolvedValue({});
  });

  it("returns empty array when inventory is not full", async () => {
    const weapons = mockWeapons("char-1", 5);
    const result = await ensureInventorySpace("char-1", "token", 2, weapons);
    expect(result).toEqual([]);
  });

  it("vaults the last unequipped weapon when inventory is full", async () => {
    const weapons = mockWeapons("char-1", 9);
    const result = await ensureInventorySpace("char-1", "token", 2, weapons);
    expect(result).toHaveLength(1);
    expect(result[0].itemInstanceId).toBe("instance-8");
  });

  it("returns empty array when no unequipped weapons available to vault", async () => {
    const weapons = mockWeapons("char-1", 9);
    weapons.forEach(w => w.isEquipped = true);
    const result = await ensureInventorySpace("char-1", "token", 2, weapons);
    expect(result).toEqual([]);
  });

  it("excludes loadout item instance IDs from being vaulted", async () => {
    const weapons = mockWeapons("char-1", 9);
    const loadoutIds = new Set(["instance-8", "instance-7"]);
    const clearResult = await ensureInventorySpace("char-1", "token", 2, weapons, undefined, loadoutIds);
    expect(clearResult).toHaveLength(1);
    expect(clearResult[0].itemInstanceId).toBe("instance-6"); // next last item
    expect(clearResult[0].transferredToVault).toBe(true);
  });

  it("ignores vault and other character weapons when finding weapon to vault", async () => {
    const charWeapons = mockWeapons("char-1", 9);
    const vaultWeapons = mockWeapons("vault", 5);
    vaultWeapons.forEach(w => w.location = "vault");
    const otherCharWeapons = mockWeapons("char-2", 5);

    const allWeapons = [...charWeapons, ...vaultWeapons, ...otherCharWeapons];
    const clearResult = await ensureInventorySpace("char-1", "token", 2, allWeapons);

    expect(clearResult).toHaveLength(1);
    expect(clearResult[0].itemInstanceId).toBe("instance-8"); // last unequipped on char-1
    expect(clearResult[0].transferredToVault).toBe(true);
  });

  it("uses correct Bungie API parameters for transfer request", async () => {
    const weapons = mockWeapons("char-1", 9);
    const membershipType = 2;
    await ensureInventorySpace("char-1", "token", membershipType, weapons);

    expect(clientModule.bungiePost).toHaveBeenCalledWith(
      "/Destiny2/Actions/Items/TransferItem/",
      "token",
      expect.objectContaining({
        transferToVault: true,
        characterId: "char-1",
        membershipType,
        itemReferenceHash: 1008, // last item hash
        itemId: "instance-8",
      })
    );
  });
});

describe("loadout item exclusion (integration)", () => {
  const mockWeapons = (characterId: string, count: number = 5): RawWeapon[] => {
    return Array.from({ length: count }, (_, i) => ({
      itemHash: 1000 + i,
      itemInstanceId: `instance-${i}`,
      slot: (["kinetic", "energy", "power"][i % 3]) as any,
      location: "character" as const,
      characterId,
      isEquipped: false,
      lightLevel: 750 - i * 10,
      tierType: 5,
    }));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (clientModule.bungiePost as jest.Mock).mockResolvedValue({});
  });

  it("never vaults weapons that are part of the loadout being applied", async () => {
    // Scenario: Inventory is full (9 weapons), loadout wants to equip instance-8
    // Even though instance-8 is the last weapon, it should NOT be vaulted
    // because it's part of the loadout
    const roster: RawWeapon[] = [
      {
        itemHash: 1000,
        itemInstanceId: "instance-0",
        slot: "kinetic",
        location: "character",
        characterId: "char-1",
        isEquipped: true,
        lightLevel: 780,
        tierType: 5,
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        itemHash: 1001 + i,
        itemInstanceId: `instance-${i + 1}`,
        slot: (["energy", "power"][i % 2]) as any,
        location: "character" as const,
        characterId: "char-1",
        isEquipped: false,
        lightLevel: 750 - i,
        tierType: 5,
      })),
    ];

    // Loadout wants instance-8 (the last weapon)
    const loadoutIds = new Set(["instance-8"]);

    // When inventory is full and we're trying to equip instance-8,
    // it should vault instance-7 instead (the next-to-last weapon)
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      roster,
      undefined,
      loadoutIds
    );

    // Should attempt to vault instance-7, NOT instance-8
    if (result.length > 0) {
      expect(result[0].itemInstanceId).toBe("instance-7");
      expect(result[0].itemInstanceId).not.toBe("instance-8");
    }
  });

  it("handles case where all unequipped weapons are part of loadout", async () => {
    // Edge case: Inventory full, ALL unequipped weapons are in the loadout
    // Should return empty array (no weapon available to vault)
    const roster: RawWeapon[] = [
      {
        itemHash: 1000,
        itemInstanceId: "instance-0",
        slot: "kinetic",
        location: "character",
        characterId: "char-1",
        isEquipped: true,
        lightLevel: 780,
        tierType: 5,
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        itemHash: 1001 + i,
        itemInstanceId: `instance-${i + 1}`,
        slot: "energy" as any,
        location: "character" as const,
        characterId: "char-1",
        isEquipped: false,
        lightLevel: 750 - i,
        tierType: 5,
      })),
    ];

    // All 8 unequipped weapons are part of the loadout
    const loadoutIds = new Set(
      Array.from({ length: 8 }, (_, i) => `instance-${i + 1}`)
    );

    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      roster,
      undefined,
      loadoutIds
    );

    // Should return empty (no available weapon to vault)
    expect(result).toEqual([]);
  });
});
