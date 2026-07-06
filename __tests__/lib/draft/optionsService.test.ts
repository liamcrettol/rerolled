/** @jest-environment node */
import { generateSlotOptions, commitSlotPick } from "@/lib/draft/optionsService";

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
      lobby_draft_options: {
        list: [{ item_hash: 1, weapon_name: "A", weapon_icon: "a", weapon_type: "Auto Rifle", damage_type: "Kinetic" }],
      },
      lobby_loadout_slots: { upsertResult: { error: null } },
    });
    const result = await commitSlotPick("lobby1", "round1", "kinetic", 1, captain, db);
    expect(result).toEqual({ ok: true });
  });
});
