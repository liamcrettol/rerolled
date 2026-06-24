import { isInventoryFull, findLastWeapon } from "../equip";
import type { RawWeapon } from "../rawInventory";

describe("isInventoryFull", () => {
  const mockWeapons = (count: number, location: "character" = "character"): RawWeapon[] => {
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
