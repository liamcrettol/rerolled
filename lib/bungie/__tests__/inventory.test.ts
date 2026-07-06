import { getWeapons } from "../inventory";
import * as clientModule from "../client";
import * as definitionsModule from "../definitions";
import type { BungieProfileResponse, DestinyItemComponent } from "@/types/bungie";

jest.mock("../client");
jest.mock("../definitions");

const VAULT_BUCKET = 138197802;
const KINETIC_BUCKET = 1498876634;

function item(overrides: Partial<DestinyItemComponent> & { itemHash: number; itemInstanceId: string }): DestinyItemComponent {
  return {
    quantity: 1,
    bindStatus: 0,
    location: 1,
    bucketHash: KINETIC_BUCKET,
    transferStatus: 0,
    lockable: false,
    state: 0,
    ...overrides,
  };
}

function weaponDef(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    itemHash: 111,
    name: "The Martlet",
    icon: "https://bungie.net/icon.jpg",
    weaponType: "Pulse Rifle",
    ammoType: "Primary",
    damageType: "Void",
    tierType: 5,
    tierName: "Legendary",
    flavorText: "",
    defaultBucketHash: KINETIC_BUCKET,
    stats: {},
    intrinsicPerkHash: null,
    catalystSocketIndex: null,
    catalystPerkHash: null,
    ...overrides,
  };
}

describe("getWeapons vault handling (#275)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves a vault weapon's slot from its definition's defaultBucketHash, not the shared vault bucket", async () => {
    const vaultWeapon = item({ itemHash: 111, itemInstanceId: "vault-instance-1", bucketHash: VAULT_BUCKET });
    const vaultArmor = item({ itemHash: 222, itemInstanceId: "vault-instance-2", bucketHash: VAULT_BUCKET });

    const profile: BungieProfileResponse = {
      characters: { data: {} },
      characterInventories: { data: {} },
      characterEquipment: { data: {} },
      profileInventory: { data: { items: [vaultWeapon, vaultArmor] } },
      itemComponents: {
        instances: {
          data: {
            "vault-instance-1": { primaryStat: { statHash: 0, value: 1810 } } as never,
            "vault-instance-2": { primaryStat: { statHash: 0, value: 1810 } } as never,
          },
        },
        sockets: { data: {} },
        reusablePlugs: { data: {} },
      },
    } as BungieProfileResponse;

    jest.mocked(clientModule.bungieGet).mockResolvedValue(profile);
    // Only the weapon hash resolves — the armor piece isn't in the weapons table.
    jest.mocked(definitionsModule.getWeaponDefinitions).mockResolvedValue(
      new Map([[111, weaponDef()]])
    );

    const weapons = await getWeapons(3, "membership-1", "token");

    expect(weapons).toHaveLength(1);
    expect(weapons[0]).toMatchObject({
      itemHash: 111,
      slot: "kinetic",
      location: "vault",
      name: "The Martlet",
    });
  });
});
