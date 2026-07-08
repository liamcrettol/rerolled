/** @jest-environment node */
import { castVote, resolveSlotTimeout } from "@/lib/draft/voteService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(config: Record<string, any>) {
  return {
    from(table: string) {
      const cfg = config[table] ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
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

const offered = [
  { item_hash: 1, weapon_name: "A", weapon_icon: "a", weapon_type: "Auto Rifle", damage_type: "Kinetic" },
  { item_hash: 2, weapon_name: "B", weapon_icon: "b", weapon_type: "Hand Cannon", damage_type: "Kinetic" },
  { item_hash: 3, weapon_name: "C", weapon_icon: "c", weapon_type: "Scout Rifle", damage_type: "Kinetic" },
];

const roster3 = [
  { user_id: "u1", is_spectator: false },
  { user_id: "u2", is_spectator: false },
  { user_id: "u3", is_spectator: false },
];

describe("castVote", () => {
  it("rejects someone not in the lobby", async () => {
    const db = makeDb({ lobby_members: { list: roster3 } });
    const result = await castVote("lobby1", "round1", "kinetic", 1, "stranger", db);
    expect(result).toEqual({ ok: false, error: "You're not in this lobby. Try rejoining." });
  });

  it("rejects a spectator", async () => {
    const db = makeDb({
      lobby_members: { list: [...roster3, { user_id: "spec", is_spectator: true }] },
    });
    const result = await castVote("lobby1", "round1", "kinetic", 1, "spec", db);
    expect(result).toEqual({ ok: false, error: "Spectators can't vote" });
  });

  it("rejects a hash that wasn't offered", async () => {
    const db = makeDb({
      lobby_members: { list: roster3 },
      lobby_loadout_slots: { maybeSingle: { data: null, error: null } },
      lobby_draft_options: { list: offered },
    });
    const result = await castVote("lobby1", "round1", "kinetic", 999, "u1", db);
    expect(result).toEqual({ ok: false, error: "That weapon wasn't one of the revealed options" });
  });

  it("no-ops if the slot is already committed", async () => {
    const db = makeDb({
      lobby_members: { list: roster3 },
      lobby_loadout_slots: { maybeSingle: { data: { id: "slot1" }, error: null } },
    });
    const result = await castVote("lobby1", "round1", "kinetic", 1, "u1", db);
    expect(result).toEqual({ ok: true, resolved: true });
  });

  it("doesn't resolve until every eligible member has voted", async () => {
    const db = makeDb({
      lobby_members: { list: roster3 },
      lobby_loadout_slots: { maybeSingle: { data: null, error: null } },
      lobby_draft_options: { list: offered },
      lobby_draft_votes: { list: [{ item_hash: 1 }] }, // only this voter's own vote counted so far
    });
    const result = await castVote("lobby1", "round1", "kinetic", 1, "u1", db);
    expect(result).toEqual({ ok: true, resolved: false });
  });

  it("resolves to the majority once everyone has voted (2-1 split)", async () => {
    const db = makeDb({
      lobby_members: { list: roster3 },
      lobby_loadout_slots: { maybeSingle: { data: null, error: null }, upsertResult: { error: null } },
      lobby_draft_options: { list: offered },
      lobby_draft_votes: { list: [{ item_hash: 1 }, { item_hash: 1 }, { item_hash: 2 }] },
    });
    const result = await castVote("lobby1", "round1", "kinetic", 1, "u3", db);
    expect(result).toEqual({ ok: true, resolved: true, itemHash: 1 });
  });
});

describe("resolveSlotTimeout", () => {
  it("rejects someone not in the lobby", async () => {
    const db = makeDb({ lobby_members: { maybeSingle: { data: null, error: null } } });
    const result = await resolveSlotTimeout("lobby1", "round1", "kinetic", "stranger", db);
    expect(result).toEqual({ ok: false, error: "You're not in this lobby. Try rejoining." });
  });

  it("no-ops if the slot is already committed", async () => {
    const db = makeDb({
      lobby_members: { maybeSingle: { data: { user_id: "u1" }, error: null } },
      lobby_loadout_slots: { maybeSingle: { data: { id: "slot1" }, error: null } },
    });
    const result = await resolveSlotTimeout("lobby1", "round1", "kinetic", "u1", db);
    expect(result).toEqual({ ok: true, resolved: true });
  });

  it("picks a random offered option when nobody voted", async () => {
    const db = makeDb({
      lobby_members: { maybeSingle: { data: { user_id: "u1" }, error: null } },
      lobby_loadout_slots: { maybeSingle: { data: null, error: null }, upsertResult: { error: null } },
      lobby_draft_options: { list: offered },
      lobby_draft_votes: { list: [] },
    });
    const result = await resolveSlotTimeout("lobby1", "round1", "kinetic", "u1", db);
    expect(result.ok).toBe(true);
    expect(result.resolved).toBe(true);
    expect([1, 2, 3]).toContain(result.itemHash);
  });

  it("tallies whatever votes exist at timeout", async () => {
    const db = makeDb({
      lobby_members: { maybeSingle: { data: { user_id: "u1" }, error: null } },
      lobby_loadout_slots: { maybeSingle: { data: null, error: null }, upsertResult: { error: null } },
      lobby_draft_options: { list: offered },
      lobby_draft_votes: { list: [{ item_hash: 2 }, { item_hash: 2 }, { item_hash: 3 }] },
    });
    const result = await resolveSlotTimeout("lobby1", "round1", "kinetic", "u1", db);
    expect(result).toEqual({ ok: true, resolved: true, itemHash: 2 });
  });
});
