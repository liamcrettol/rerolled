/** @jest-environment node */
import { applyWeapons, findBestInstance, type WeaponToApply } from "@/lib/bungie/equip";
import { bungiePost } from "@/lib/bungie/client";
import type { RawWeapon } from "@/lib/bungie/rawInventory";

jest.mock("@/lib/bungie/client", () => ({
  bungiePost: jest.fn(),
}));

// Never depend on lib/bungie/data/*.json - fixed hashes via a mock instead.
jest.mock("@/lib/bungie/definitions", () => ({
  getWeaponDefinitions: jest.fn(async (hashes: number[]) =>
    new Map(
      hashes.map((h) => [h, { name: `Weapon ${h}`, icon: `/icon/${h}.jpg`, tierType: 5 }])
    )
  ),
  getWeaponGroupHashes: jest.fn((h: number) => [h]),
}));

const TARGET = "charA";
const OTHER = "charB";

function weapon(
  over: Partial<RawWeapon> & { itemHash: number; itemInstanceId: string }
): RawWeapon {
  return {
    slot: "kinetic",
    location: "character",
    characterId: OTHER,
    isEquipped: false,
    lightLevel: 1800,
    tierType: 5,
    ...over,
  };
}

type Call = { path: string; body: Record<string, unknown> };
let calls: Call[];

beforeEach(() => {
  calls = [];
  (bungiePost as jest.Mock).mockReset().mockImplementation(
    async (path: string, _token: string, body: Record<string, unknown>) => {
      calls.push({ path, body });
      if (path.includes("EquipItems")) {
        return {
          equipResults: (body.itemIds as string[]).map((id) => ({
            itemInstanceId: id,
            equipStatus: 1,
          })),
        };
      }
      return {};
    }
  );
});

describe("findBestInstance", () => {
  it("prefers an unequipped copy over one equipped on another character", () => {
    const roster = [
      weapon({ itemHash: 100, itemInstanceId: "equipped", isEquipped: true }),
      weapon({ itemHash: 100, itemInstanceId: "spare" }),
    ];
    expect(findBestInstance(100, roster, TARGET)?.itemInstanceId).toBe("spare");
  });

  it("still honors a preferred instance that is equipped elsewhere", () => {
    const roster = [
      weapon({ itemHash: 100, itemInstanceId: "equipped", isEquipped: true }),
      weapon({ itemHash: 100, itemInstanceId: "spare" }),
    ];
    expect(findBestInstance(100, roster, TARGET, "equipped")?.itemInstanceId).toBe("equipped");
  });
});

describe("applyWeapons with a copy equipped on another character", () => {
  const toApply: WeaponToApply[] = [
    {
      itemHash: 100,
      itemInstanceId: "i1",
      slot: "kinetic",
      location: "character",
      characterId: OTHER,
    },
  ];

  it("equips a spare already on that character before transferring", async () => {
    const roster = [
      weapon({ itemHash: 100, itemInstanceId: "i1", isEquipped: true }),
      weapon({ itemHash: 200, itemInstanceId: "spare" }),
    ];

    const results = await applyWeapons(toApply, TARGET, 3, "tok", "u1", "Liam", roster);

    expect(results).toEqual([expect.objectContaining({ slot: "kinetic", success: true })]);
    const summary = calls.map((c) => ({
      equip: c.path.includes("EquipItems"),
      characterId: c.body.characterId,
      item: c.body.itemId ?? (c.body.itemIds as string[] | undefined)?.[0],
    }));
    expect(summary).toEqual([
      { equip: true, characterId: OTHER, item: "spare" }, // free the bucket
      { equip: false, characterId: OTHER, item: "i1" }, // to vault
      { equip: false, characterId: TARGET, item: "i1" }, // to target
      { equip: true, characterId: TARGET, item: "i1" }, // final equip
    ]);
  });

  it("pulls a vault stand-in when that character has nothing else in the slot", async () => {
    const roster = [
      weapon({ itemHash: 100, itemInstanceId: "i1", isEquipped: true }),
      weapon({ itemHash: 300, itemInstanceId: "standin", location: "vault", characterId: undefined }),
    ];

    const results = await applyWeapons(toApply, TARGET, 3, "tok", "u1", "Liam", roster);

    expect(results).toEqual([expect.objectContaining({ slot: "kinetic", success: true })]);
    const summary = calls.map((c) => ({
      equip: c.path.includes("EquipItems"),
      characterId: c.body.characterId,
      item: c.body.itemId ?? (c.body.itemIds as string[] | undefined)?.[0],
    }));
    expect(summary).toEqual([
      { equip: false, characterId: OTHER, item: "standin" }, // vault -> other char
      { equip: true, characterId: OTHER, item: "standin" }, // free the bucket
      { equip: false, characterId: OTHER, item: "i1" }, // to vault
      { equip: false, characterId: TARGET, item: "i1" }, // to target
      { equip: true, characterId: TARGET, item: "i1" }, // final equip
    ]);
  });

  it("ignores vault weapons from other slots when picking a stand-in", async () => {
    const roster = [
      weapon({ itemHash: 100, itemInstanceId: "i1", isEquipped: true }),
      weapon({ itemHash: 400, itemInstanceId: "wrong-slot", slot: "power", location: "vault", characterId: undefined }),
    ];

    const results = await applyWeapons(toApply, TARGET, 3, "tok", "u1", "Liam", roster);

    const kinetic = results.find((r) => r.slot === "kinetic");
    expect(kinetic?.success).toBe(false);
    expect(kinetic?.error).toContain("nothing to swap in");
  });

  it("fails with a clear message when nothing can swap in", async () => {
    const roster = [weapon({ itemHash: 100, itemInstanceId: "i1", isEquipped: true })];

    const results = await applyWeapons(toApply, TARGET, 3, "tok", "u1", "Liam", roster);

    expect(results).toEqual([
      expect.objectContaining({
        slot: "kinetic",
        success: false,
        error: expect.stringContaining("nothing to swap in"),
      }),
    ]);
    // No equip attempt should reach the target character.
    expect(calls.some((c) => c.path.includes("EquipItems") && c.body.characterId === TARGET)).toBe(false);
  });
});
