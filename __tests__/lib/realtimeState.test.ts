/**
 * Characterization tests for the lobby realtime state transforms (#223).
 * These pin the merge semantics both LobbyRoom and WatchView rely on when
 * applying Supabase postgres_changes payloads.
 */
import {
  mergeSlot,
  upsertMember,
  updateMember,
  removeMemberById,
  wildcardsFromSlots,
} from "@/lib/lobby/realtimeState";
import type { LobbyLoadoutSlot } from "@/types/lobby";

function slot(overrides: Partial<LobbyLoadoutSlot>): LobbyLoadoutSlot {
  return {
    id: "s-1",
    round_id: "r-1",
    slot: "kinetic",
    item_hash: 100,
    weapon_name: "Gun",
    weapon_icon: "/g.png",
    weapon_type: "Auto Rifle",
    damage_type: "Kinetic",
    locked_by_user_id: "u-1",
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("mergeSlot", () => {
  it("appends a slot that isn't present yet", () => {
    const next = mergeSlot([slot({ slot: "kinetic" })], slot({ id: "s-2", slot: "energy" }));
    expect(next.map((s) => s.slot)).toEqual(["kinetic", "energy"]);
  });

  it("replaces an existing slot: the incoming row wins", () => {
    const next = mergeSlot(
      [slot({ slot: "kinetic", item_hash: 100 })],
      slot({ id: "s-2", slot: "kinetic", item_hash: 200 })
    );
    expect(next).toHaveLength(1);
    expect(next[0].item_hash).toBe(200);
  });

  it("moves the replaced slot to the end of the list (append semantics)", () => {
    const next = mergeSlot(
      [slot({ slot: "kinetic" }), slot({ id: "s-2", slot: "energy" })],
      slot({ id: "s-3", slot: "kinetic", item_hash: 300 })
    );
    expect(next.map((s) => s.slot)).toEqual(["energy", "kinetic"]);
  });
});

describe("member transforms", () => {
  const alice = { id: "m-1", name: "Alice" };
  const bob = { id: "m-2", name: "Bob" };

  it("upsertMember appends new members", () => {
    expect(upsertMember([alice], bob)).toEqual([alice, bob]);
  });

  it("upsertMember replaces on id collision (realtime can echo an existing row)", () => {
    const next = upsertMember([alice, bob], { id: "m-1", name: "Alice v2" });
    expect(next).toHaveLength(2);
    expect(next.find((m) => m.id === "m-1")?.name).toBe("Alice v2");
  });

  it("updateMember modifies in place and preserves order", () => {
    const next = updateMember([alice, bob], { id: "m-2", name: "Bob v2" });
    expect(next.map((m) => m.name)).toEqual(["Alice", "Bob v2"]);
  });

  it("updateMember ignores unknown ids — no phantom inserts from stray UPDATEs", () => {
    expect(updateMember([alice], { id: "m-9", name: "Ghost" })).toEqual([alice]);
  });

  it("removeMemberById drops only the matching member", () => {
    expect(removeMemberById([alice, bob], "m-1")).toEqual([bob]);
  });
});

describe("wildcardsFromSlots", () => {
  it("marks item_hash 0 rows as wildcards", () => {
    const wc = wildcardsFromSlots([
      slot({ slot: "kinetic", item_hash: 0 }),
      slot({ slot: "energy", item_hash: 200 }),
      slot({ slot: "power", item_hash: 300 }),
    ]);
    expect(wc.has("kinetic")).toBe(true);
    expect(wc.has("energy")).toBe(false);
  });

  it("defaults power to wildcard when no real heavy was rolled", () => {
    const wc = wildcardsFromSlots([slot({ slot: "kinetic", item_hash: 100 })]);
    expect(wc.has("power")).toBe(true);
  });

  it("does NOT default power to wildcard once a real heavy is rolled", () => {
    const wc = wildcardsFromSlots([slot({ slot: "power", item_hash: 400 })]);
    expect(wc.has("power")).toBe(false);
  });

  it("empty slot list → power-only wildcard set (fresh round default)", () => {
    const wc = wildcardsFromSlots([]);
    expect([...wc]).toEqual(["power"]);
  });
});
