/** @jest-environment node */
import {
  buildEndgameWeaponRoll,
  collectEndgameArmorCandidateHashes,
  pickEndgameActivity,
  selectExoticArmorOptions,
  ARMOR_BUCKET_HASHES,
  ARMOR_SLOT_LABELS,
  ENDGAME_KIND_FIRETEAM_SIZE,
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
  it("only returns armor-slot hashes for the selected class plus vault", () => {
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
          hunter: {
            items: [
              { itemHash: 111, itemInstanceId: "a", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3448274439, transferStatus: 0, lockable: false, state: 0 },
              { itemHash: 222, itemInstanceId: "b", quantity: 1, bindStatus: 0, location: 1, bucketHash: 1498876634, transferStatus: 0, lockable: false, state: 0 },
            ],
          },
          warlock: {
            items: [
              { itemHash: 999, itemInstanceId: "z", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3448274439, transferStatus: 0, lockable: false, state: 0 },
            ],
          },
        },
      },
      characterInventories: {
        data: {
          hunter: {
            items: [
              { itemHash: 333, itemInstanceId: "c", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3551918588, transferStatus: 0, lockable: false, state: 0 },
              { itemHash: 777, itemInstanceId: "f", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3284755031, transferStatus: 0, lockable: false, state: 0 },
            ],
          },
          warlock: {
            items: [
              { itemHash: 888, itemInstanceId: "y", quantity: 1, bindStatus: 0, location: 1, bucketHash: 14239492, transferStatus: 0, lockable: false, state: 0 },
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

    expect(collectEndgameArmorCandidateHashes(profile, "hunter")).toEqual([333, 111, 444]);
  });

  it("filters to only the target bucket hash when one is given", () => {
    const profile: Pick<
      BungieProfileResponse,
      "characters" | "characterEquipment" | "characterInventories" | "profileInventory"
    > = {
      characters: { data: { hunter: makeCharacter("hunter", 1) } },
      characterEquipment: { data: { hunter: { items: [] } } },
      characterInventories: {
        data: {
          hunter: {
            items: [
              { itemHash: 111, itemInstanceId: "a", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3448274439, transferStatus: 0, lockable: false, state: 0 },
              { itemHash: 333, itemInstanceId: "c", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3551918588, transferStatus: 0, lockable: false, state: 0 },
            ],
          },
        },
      },
      profileInventory: { data: { items: [] } },
    };

    expect(collectEndgameArmorCandidateHashes(profile, "hunter", ARMOR_BUCKET_HASHES.HELMET)).toEqual([111]);
    expect(collectEndgameArmorCandidateHashes(profile, "hunter", ARMOR_BUCKET_HASHES.GAUNTLETS)).toEqual([333]);
    expect(collectEndgameArmorCandidateHashes(profile, "hunter", ARMOR_BUCKET_HASHES.CHEST)).toEqual([]);
  });
});

describe("selectExoticArmorOptions — bucket hash filter", () => {
  it("only returns options matching the target slot", () => {
    const profile: Pick<
      BungieProfileResponse,
      "characters" | "characterEquipment" | "characterInventories" | "profileInventory"
    > = {
      characters: { data: { hunter: makeCharacter("hunter", 1) } },
      characterEquipment: { data: { hunter: { items: [] } } },
      characterInventories: {
        data: {
          hunter: {
            items: [
              { itemHash: 101, itemInstanceId: "a", quantity: 1, bindStatus: 0, location: 1, bucketHash: 3448274439, transferStatus: 0, lockable: false, state: 0 },
              { itemHash: 102, itemInstanceId: "b", quantity: 1, bindStatus: 0, location: 1, bucketHash: 14239492, transferStatus: 0, lockable: false, state: 0 },
            ],
          },
        },
      },
      profileInventory: { data: { items: [] } },
    };
    const manifestItems = {
      "101": { itemType: 2, classType: 1, itemTypeDisplayName: "Helmet", inventory: { tierType: 6 }, displayProperties: { name: "Wormhusk Crown", icon: "/wormhusk.png" } },
      "102": { itemType: 2, classType: 1, itemTypeDisplayName: "Chest Armor", inventory: { tierType: 6 }, displayProperties: { name: "Gyrfalcon's Hauberk", icon: "/gyrfalcon.png" } },
    };

    const helmetOnly = selectExoticArmorOptions(profile, manifestItems, "hunter", ARMOR_BUCKET_HASHES.HELMET);
    expect(helmetOnly.options.map((o) => o.name)).toEqual(["Wormhusk Crown"]);

    const chestOnly = selectExoticArmorOptions(profile, manifestItems, "hunter", ARMOR_BUCKET_HASHES.CHEST);
    expect(chestOnly.options.map((o) => o.name)).toEqual(["Gyrfalcon's Hauberk"]);

    const legsOnly = selectExoticArmorOptions(profile, manifestItems, "hunter", ARMOR_BUCKET_HASHES.LEGS);
    expect(legsOnly.options).toEqual([]);

    // No filter at all - existing solo behavior, unchanged.
    const unfiltered = selectExoticArmorOptions(profile, manifestItems, "hunter");
    expect(unfiltered.options).toHaveLength(2);
  });
});

describe("ENDGAME_KIND_FIRETEAM_SIZE / ARMOR_BUCKET_HASHES", () => {
  it("has a fireteam size for every endgame activity kind", () => {
    expect(ENDGAME_KIND_FIRETEAM_SIZE).toEqual({ raid: 6, dungeon: 3, grandmaster: 3 });
  });

  it("has a display label for every armor bucket hash", () => {
    for (const hash of Object.values(ARMOR_BUCKET_HASHES)) {
      expect(ARMOR_SLOT_LABELS[hash]).toBeTruthy();
    }
  });
});
