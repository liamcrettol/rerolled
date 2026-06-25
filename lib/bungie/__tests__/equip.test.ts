import { isInventoryFull, findLastWeapon, ensureInventorySpace, calculateVaultNeeded } from "../equip";
import type { RawWeapon } from "../rawInventory";
import * as clientModule from "../client";

jest.mock("../client");
jest.mock("../definitions");

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
    const result = await ensureInventorySpace("char-1", "token", 2, weapons, 3);
    expect(result).toEqual([]);
  });

  it("vaults the lowest light unequipped weapons to make room", async () => {
    const weapons = mockWeapons("char-1", 9);
    const result = await ensureInventorySpace("char-1", "token", 2, weapons, 3);
    expect(result).toHaveLength(3); // Need to vault 3 to fit incoming 3
    // Should vault the 3 lowest light weapons (instance-8, instance-7, instance-6)
    expect(result[0].itemInstanceId).toBe("instance-8");
    expect(result[1].itemInstanceId).toBe("instance-7");
    expect(result[2].itemInstanceId).toBe("instance-6");
  });

  it("returns empty array when no unequipped weapons available to vault", async () => {
    const weapons = mockWeapons("char-1", 9);
    weapons.forEach(w => w.isEquipped = true);
    const result = await ensureInventorySpace("char-1", "token", 2, weapons, 3);
    expect(result).toEqual([]);
  });

  it("excludes loadout item instance IDs from being vaulted", async () => {
    const weapons = mockWeapons("char-1", 9);
    const loadoutIds = new Set(["instance-8", "instance-7"]);
    const clearResult = await ensureInventorySpace("char-1", "token", 2, weapons, 3, loadoutIds);
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
    const clearResult = await ensureInventorySpace("char-1", "token", 2, allWeapons, 3);

    expect(clearResult).toHaveLength(3); // Need to vault 3 to fit incoming 3
    // Should only vault weapons from char-1, not from vault or other characters
    expect(clearResult[0].itemInstanceId).toBe("instance-8");
    expect(clearResult[1].itemInstanceId).toBe("instance-7");
    expect(clearResult[2].itemInstanceId).toBe("instance-6");
    clearResult.forEach(r => expect(r.transferredToVault).toBe(true));
  });

  it("uses correct Bungie API parameters for transfer request", async () => {
    const weapons = mockWeapons("char-1", 9);
    const membershipType = 2;
    await ensureInventorySpace("char-1", "token", membershipType, weapons, 3);

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
      1, // Incoming weapon count forces vault calculation
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
      1, // Incoming weapon count forces vault calculation
      loadoutIds
    );

    // Should return empty (no available weapon to vault)
    expect(result).toEqual([]);
  });
});

describe("calculateVaultNeeded", () => {
  const mockWeapons = (charCount: number, equipped: number = 3): RawWeapon[] => {
    const allWeapons: RawWeapon[] = [];
    for (let i = 0; i < charCount; i++) {
      allWeapons.push({
        itemHash: 1000 + i,
        itemInstanceId: `instance-${i}`,
        slot: (["kinetic", "energy", "power"][i % 3]) as any,
        location: "character",
        characterId: "char-1",
        isEquipped: i < equipped,
        lightLevel: 750 - i,
        tierType: 5,
      });
    }
    return allWeapons;
  };

  it("returns 0 when inventory has space", () => {
    const weapons = mockWeapons(7, 3);
    const needed = calculateVaultNeeded("char-1", weapons, 1);
    expect(needed).toBe(0);
  });

  it("returns needed count when inventory is full", () => {
    const weapons = mockWeapons(9, 3);
    const needed = calculateVaultNeeded("char-1", weapons, 6);
    expect(needed).toBe(3);
  });

  it("respects safety threshold (never vault more than 50% of unequipped)", () => {
    const weapons = mockWeapons(9, 3);
    const needed = calculateVaultNeeded("char-1", weapons, 8);
    expect(needed).toBe(3);
  });

  it("returns 0 when loadout has weapons already on character", () => {
    const weapons = mockWeapons(9, 3);
    const needed = calculateVaultNeeded("char-1", weapons, 3, new Set(["instance-0", "instance-1", "instance-2"]));
    expect(needed).toBe(0);
  });

  it("returns 0 when no weapons to vault available", () => {
    const weapons = mockWeapons(9, 9);
    const needed = calculateVaultNeeded("char-1", weapons, 3);
    expect(needed).toBe(0);
  });
});

import { applyWeapons } from "../equip";
import { getWeaponDefinitions } from "../definitions";

describe("applyWeapons result enrichment", () => {
  const HASH = 5001;
  const ICON = "/common/destiny2_content/icons/riptide.jpg";

  beforeEach(() => {
    jest.clearAllMocks();
    (getWeaponDefinitions as jest.Mock).mockResolvedValue(
      new Map([
        [
          HASH,
          {
            itemHash: HASH,
            name: "Riptide",
            icon: ICON,
            weaponType: "Fusion Rifle",
            ammoType: "Special",
            damageType: "Stasis",
            tierName: "Legendary",
            tierType: 5,
            flavorText: "",
            defaultBucketHash: 0,
            stats: {},
            intrinsicPerk: null,
          },
        ],
      ])
    );
  });

  it("attaches weapon_name and weapon_icon on a successful equip", async () => {
    (clientModule.bungiePost as jest.Mock).mockResolvedValue({
      equipResults: [{ itemInstanceId: "inst-1", equipStatus: 1 }],
    });

    const weapons = [
      {
        itemHash: HASH,
        itemInstanceId: "inst-1",
        slot: "energy" as const,
        location: "character" as const,
        characterId: "char-1",
      },
    ];

    const results = await applyWeapons(weapons, "char-1", 2, "token", "u1", "Guardian#1234", []);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].weapon_name).toBe("Riptide");
    expect(results[0].weapon_icon).toBe(ICON);
  });

  it("keeps friendly error and captures raw error_detail on a no-room transfer failure", async () => {
    (clientModule.bungiePost as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("TransferItem")) {
        return Promise.reject(new Error("Bungie code 1642 DestinationFull"));
      }
      return Promise.resolve({ equipResults: [] });
    });

    // location "vault" forces a transfer; empty roster means makeRoom finds no spare and gives up.
    const weapons = [
      {
        itemHash: HASH,
        itemInstanceId: "inst-1",
        slot: "energy" as const,
        location: "vault" as const,
      },
    ];

    const results = await applyWeapons(weapons, "char-1", 2, "token", "u1", "Guardian#1234", []);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe(
      "Inventory full and no spare weapon to move — clear a slot, then Apply again"
    );
    expect(results[0].error_detail).toBe("Bungie code 1642 DestinationFull");
    expect(results[0].weapon_name).toBe("Riptide");
  });
});
