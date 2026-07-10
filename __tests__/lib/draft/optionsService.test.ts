/** @jest-environment node */
import { generateSlotOptions, commitSlotPick } from "@/lib/draft/optionsService";
import { getWeaponAmmoType, getWeaponTierType } from "@/lib/bungie/definitions";

// Mock the ammo-type lookup so the double-special rule is tested against fixed
// hashes rather than the weekly-refreshed weapons table.
jest.mock("@/lib/bungie/definitions", () => ({
  getWeaponAmmoType: jest.fn(() => null),
  getWeaponTierType: jest.fn(() => null),
}));
const mockAmmo = getWeaponAmmoType as jest.MockedFunction<typeof getWeaponAmmoType>;
const mockTier = getWeaponTierType as jest.MockedFunction<typeof getWeaponTierType>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(config: Record<string, any>) {
  return {
    from(table: string) {
      const cfg = config[table] ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        delete: () => builder,
        insert: (rows: unknown) => {
          cfg.inserted = rows;
          return builder;
        },
        upsert: (row: unknown) => {
          cfg.upserted = row;
          return Promise.resolve(cfg.upsertResult ?? { error: null });
        },
        single: async () => cfg.single ?? { data: null, error: null },
        maybeSingle: async () => cfg.maybeSingle ?? { data: null, error: null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => resolve(cfg.terminal ?? { data: cfg.list ?? [], error: null }),
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const captain = "captain1";
const other = "member2";

describe("generateSlotOptions", () => {
  it("rejects a non-captain", async () => {
    const db = makeDb({ lobbies: { single: { data: { captain_user_id: captain }, error: null } } });
    const result = await generateSlotOptions("lobby1", "round1", "kinetic", other, db);
    expect(result).toEqual({ ok: false, error: "Only the captain can run the draft" });
  });

  it("errors when the lobby pool hasn't been cached yet", async () => {
    const db = makeDb({
      lobbies: { single: { data: { captain_user_id: captain }, error: null } },
      lobby_pools: { single: { data: null, error: null } },
    });
    const result = await generateSlotOptions("lobby1", "round1", "kinetic", captain, db);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No shared weapon pool/);
  });

  it("returns up to 3 candidates with resolved weapon details", async () => {
    const db = makeDb({
      lobbies: { single: { data: { captain_user_id: captain }, error: null } },
      lobby_pools: {
        single: {
          data: {
            pool: { kinetic: [1, 2, 3, 4], energy: [], power: [] },
            weapon_details: {
              "1": { name: "Weapon 1", icon: "i1", weaponType: "Auto Rifle", damageType: "Kinetic" },
              "2": { name: "Weapon 2", icon: "i2", weaponType: "Hand Cannon", damageType: "Kinetic" },
              "3": { name: "Weapon 3", icon: "i3", weaponType: "Scout Rifle", damageType: "Kinetic" },
              "4": { name: "Weapon 4", icon: "i4", weaponType: "Sidearm", damageType: "Kinetic" },
            },
          },
          error: null,
        },
      },
    });
    const result = await generateSlotOptions("lobby1", "round1", "kinetic", captain, db);
    expect(result.ok).toBe(true);
    expect(result.options).toHaveLength(3);
    expect(new Set(result.options?.map((o) => o.itemHash)).size).toBe(3);
  });
});

describe("generateSlotOptions — no double special", () => {
  // Energy pool: 10/11 are Special-ammo, 12/13 are Primary.
  const ammoByHash: Record<number, string> = { 5: "Special", 6: "Primary", 10: "Special", 11: "Special", 12: "Primary", 13: "Primary" };
  const energyDetails = {
    "10": { name: "Special A", icon: "i10", weaponType: "Shotgun", damageType: "Arc" },
    "11": { name: "Special B", icon: "i11", weaponType: "Fusion Rifle", damageType: "Void" },
    "12": { name: "Primary A", icon: "i12", weaponType: "Auto Rifle", damageType: "Arc" },
    "13": { name: "Primary B", icon: "i13", weaponType: "Pulse Rifle", damageType: "Void" },
  };

  function energyDb(kineticPickHash: number | null, pool: number[]) {
    return makeDb({
      lobbies: { single: { data: { captain_user_id: captain }, error: null } },
      lobby_pools: {
        single: { data: { pool: { kinetic: [], energy: pool, power: [] }, weapon_details: energyDetails }, error: null },
      },
      lobby_loadout_slots: {
        maybeSingle: kineticPickHash === null ? { data: null, error: null } : { data: { item_hash: kineticPickHash }, error: null },
      },
    });
  }

  beforeEach(() => mockAmmo.mockImplementation((h: number) => ammoByHash[h] ?? null));
  afterEach(() => mockAmmo.mockReset());

  it("excludes Special energy weapons when the Kinetic pick is Special", async () => {
    const db = energyDb(5, [10, 11, 12, 13]);
    const result = await generateSlotOptions("lobby1", "round1", "energy", captain, db);
    expect(result.ok).toBe(true);
    const hashes = result.options!.map((o) => o.itemHash);
    expect(hashes.every((h) => h === 12 || h === 13)).toBe(true);
  });

  it("keeps Special energy weapons when the Kinetic pick is Primary", async () => {
    const db = energyDb(6, [10, 11, 12, 13]);
    const result = await generateSlotOptions("lobby1", "round1", "energy", captain, db);
    expect(result.ok).toBe(true);
    // Full pool eligible — at least one Special hash can appear across the draw.
    const drawn = new Set(result.options!.map((o) => o.itemHash));
    expect([...drawn].every((h) => [10, 11, 12, 13].includes(h))).toBe(true);
  });

  it("falls back to the full pool if the group owns no non-Special energy weapon", async () => {
    const db = energyDb(5, [10, 11]);
    const result = await generateSlotOptions("lobby1", "round1", "energy", captain, db);
    expect(result.ok).toBe(true);
    expect(result.options!.length).toBe(2);
  });
});

describe("commitSlotPick", () => {
  it("rejects a non-captain", async () => {
    const db = makeDb({ lobbies: { single: { data: { captain_user_id: captain }, error: null } } });
    const result = await commitSlotPick("lobby1", "round1", "kinetic", 1, other, db);
    expect(result).toEqual({ ok: false, error: "Only the captain can run the draft" });
  });

  it("rejects a hash that wasn't offered", async () => {
    const db = makeDb({
      lobbies: { single: { data: { captain_user_id: captain }, error: null } },
      lobby_draft_options: {
        list: [{ item_hash: 1, weapon_name: "A", weapon_icon: "a", weapon_type: "Auto Rifle", damage_type: "Kinetic" }],
      },
    });
    const result = await commitSlotPick("lobby1", "round1", "kinetic", 999, captain, db);
    expect(result).toEqual({ ok: false, error: "That weapon wasn't one of the revealed options" });
  });

  it("commits an offered pick into lobby_loadout_slots", async () => {
    const db = makeDb({
      lobbies: { single: { data: { captain_user_id: captain }, error: null } },
      lobby_members: { list: [{ user_id: captain, is_spectator: false }] },
      lobby_draft_options: {
        list: [{ item_hash: 1, weapon_name: "A", weapon_icon: "a", weapon_type: "Auto Rifle", damage_type: "Kinetic" }],
      },
      lobby_loadout_slots: { upsertResult: { error: null } },
    });
    const result = await commitSlotPick("lobby1", "round1", "kinetic", 1, captain, db);
    expect(result).toEqual({ ok: true });
  });

  it("rejects a second exotic even if it was offered", async () => {
    mockTier.mockImplementation((hash) => (hash === 1 || hash === 2 ? 6 : 5));
    const db = makeDb({
      lobbies: { single: { data: { captain_user_id: captain }, error: null } },
      lobby_members: { list: [{ user_id: captain, is_spectator: false }] },
      lobby_draft_options: {
        list: [{ item_hash: 2, weapon_name: "B", weapon_icon: "b", weapon_type: "Bow", damage_type: "Void" }],
      },
      lobby_loadout_slots: {
        list: [{ slot: "kinetic", item_hash: 1 }],
      },
    });
    const result = await commitSlotPick("lobby1", "round1", "energy", 2, captain, db);
    expect(result).toEqual({ ok: false, error: "Only one exotic weapon can be equipped in a loadout" });
  });
});
