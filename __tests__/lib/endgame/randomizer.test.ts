/** @jest-environment node */
import {
  buildEndgameWeaponRoll,
  collectEndgameArmorCandidateHashes,
  pickEndgameActivity,
  selectExoticArmorOptions,
} from "@/lib/endgame/randomizer";
import type { ScoreAttackActivity } from "@/lib/scoreAttack/activityPool";
import type { ResolvedWeapon } from "@/types/weapon";
import type { BungieProfileResponse, DestinyCharacter } from "@/types/bungie";

function makeWeapon(
  slot: "kinetic" | "energy" | "power",
  itemHash: number,
  name: string,
  weaponType: string,
  ammoType: string,
  damageType: string
): ResolvedWeapon {
  return {
    itemHash,
    itemInstanceId: `${itemHash}`,
    name,
    flavorText: "",
    icon: `/icons/${itemHash}.png`,
    slot,
    weaponType,
    ammoType,
    damageType,
    damageTypeIcon: "/icons/damage-kinetic.png",
    lightLevel: 2000,
    isEquipped: false,
    location: "vault",
    perks: [],
    stats: [],
    tierType: 5,
    tierName: "Legendary",
  };
}

function makeCharacter(characterId: string, classType: number): DestinyCharacter {
  return {
    characterId,
    membershipType: 3,
    membershipId: "123",
    classType,
    raceType: 0,
    genderType: 0,
    light: 2020,
    emblemBackgroundPath: "",
    emblemPath: "",
    dateLastPlayed: "2026-07-07T00:00:00Z",
  };
}

describe("pickEndgameActivity", () => {
  it("only rolls from the selected endgame pools", () => {
    const source: ScoreAttackActivity[] = [
      { name: "Ghosts of the Deep", pillar: "pve", kind: "dungeon", activityHashes: [1001] },
      { name: "King's Fall", pillar: "pve", kind: "raid", activityHashes: [2001] },
    ];

    const result = pickEndgameActivity(["raid"], () => 0, source);

    expect(result).toEqual({
      activityHash: 2001,
      name: "King's Fall",
      kind: "raid",
      label: "Raid",
    });
  });
});

describe("buildEndgameWeaponRoll", () => {
  it("builds one rolled weapon for each slot", () => {
    const loadout = buildEndgameWeaponRoll([
      makeWeapon("kinetic", 1, "Hung Jury", "Scout Rifle", "Primary", "Kinetic"),
      makeWeapon("energy", 2, "Forbearance", "Grenade Launcher", "Special", "Arc"),
      makeWeapon("power", 3, "Hothead", "Rocket Launcher", "Heavy", "Arc"),
    ]);

    expect(loadout.map((weapon) => weapon.slot)).toEqual(["kinetic", "energy", "power"]);
    expect(loadout.map((weapon) => weapon.name)).toEqual(["Hung Jury", "Forbearance", "Hothead"]);
  });
});

describe("selectExoticArmorOptions", () => {
  it("filters to class-valid exotic armor and prefers the selected character copy", () => {
    const profile: Pick<
      BungieProfileResponse,
      "characters" | "characterEquipment" | "characterInventories" | "profileInventory"
    > = {
      characters: {
        data: {
          hunter: makeCharacter("hunter", 1),
          warlock: makeCharacter("warlock", 2),
        },
      },
      characterEquipment: {
        data: {
          hunter: { items: [{ itemHash: 101, itemInstanceId: "a", quantity: 1, bindStatus: 0, location: 1, bucketHash: 0, transferStatus: 0, lockable: false, state: 0 }] },
          warlock: { items: [{ itemHash: 101, itemInstanceId: "b", quantity: 1, bindStatus: 0, location: 1, bucketHash: 0, transferStatus: 0, lockable: false, state: 0 }] },
        },
      },
      characterInventories: {
        data: {
          hunter: { items: [] },
          warlock: { items: [{ itemHash: 201, itemInstanceId: "w", quantity: 1, bindStatus: 0, location: 1, bucketHash: 0, transferStatus: 0, lockable: false, state: 0 }] },
        },
      },
      profileInventory: {
        data: {
          items: [{ itemHash: 102, itemInstanceId: "c", quantity: 1, bindStatus: 0, location: 2, bucketHash: 0, transferStatus: 0, lockable: false, state: 0 }],
        },
      },
    };

    const manifestItems = {
      "101": {
        itemType: 2,
        classType: 1,
        itemTypeDisplayName: "Helmet",
        inventory: { tierType: 6 },
        displayProperties: { name: "Wormhusk Crown", icon: "/wormhusk.png" },
      },
      "102": {
        itemType: 2,
        classType: 1,
        itemTypeDisplayName: "Chest Armor",
        inventory: { tierType: 6 },
        displayProperties: { name: "Gyrfalcon's Hauberk", icon: "/gyrfalcon.png" },
      },
      "201": {
        itemType: 2,
        classType: 2,
        itemTypeDisplayName: "Helmet",
        inventory: { tierType: 6 },
        displayProperties: { name: "Crown of Tempests", icon: "/crown.png" },
      },
    };

    const { character, options } = selectExoticArmorOptions(profile, manifestItems, "hunter");

    expect(character.classType).toBe(1);
    expect(options).toHaveLength(2);
    expect(options.map((choice) => choice.itemHash)).toEqual([101, 102]);
    expect(options[0]).toMatchObject({
      itemHash: 101,
      characterId: "hunter",
      isEquipped: true,
    });
  });
});

describe("collectEndgameArmorCandidateHashes", () => {
  it("only returns non-weapon hashes from equipment, inventory, and vault", () => {
    const profile: Pick<
      BungieProfileResponse,
      "characters" | "characterEquipment" | "characterInventories" | "profileInventory"
    > = {
      characters: {
        data: {
          hunter: makeCharacter("hunter", 1),
        },
      },
      characterEquipment: {
        data: {
          hunter: {
            items: [
              { itemHash: 111, itemInstanceId: "a", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3448274439, transferStatus: 0, lockable: false, state: 0 },
              { itemHash: 222, itemInstanceId: "b", quantity: 1, bindStatus: 0, location: 1, bucketHash: 1498876634, transferStatus: 0, lockable: false, state: 0 },
            ],
          },
        },
      },
      characterInventories: {
        data: {
          hunter: {
            items: [
              { itemHash: 333, itemInstanceId: "c", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3551918588, transferStatus: 0, lockable: false, state: 0 },
            ],
          },
        },
      },
      profileInventory: {
        data: {
          items: [
            { itemHash: 444, itemInstanceId: "d", quantity: 1, bindStatus: 0, location: 2, bucketHash: 1585787867, transferStatus: 0, lockable: false, state: 0 },
            { itemHash: 222, itemInstanceId: "e", quantity: 1, bindStatus: 2, location: 2, bucketHash: 1498876634, transferStatus: 0, lockable: false, state: 0 },
          ],
        },
      },
    };

    expect(collectEndgameArmorCandidateHashes(profile)).toEqual([333, 111, 444]);
  });
});
