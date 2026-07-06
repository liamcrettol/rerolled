/** @jest-environment node */
import { startDraftSession, getDraftState, recordPick } from "@/lib/draft/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(config: Record<string, any>) {
  return {
    from(table: string) {
      const cfg = config[table] ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        insert: (row: unknown) => {
          cfg.inserted = cfg.inserted ?? [];
          cfg.inserted.push(row);
          return builder;
        },
        update: (row: unknown) => {
          cfg.updated = row;
          return builder;
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

describe("startDraftSession", () => {
  it("requires at least 2 non-spectator members", async () => {
    const db = makeDb({ lobby_members: { list: [{ user_id: "a" }] } });
    const result = await startDraftSession("lobby1", db);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/at least 2/) });
  });

  it("creates a session with join-order turn order", async () => {
    const db = makeDb({
      lobby_members: { list: [{ user_id: "a" }, { user_id: "b" }] },
      draft_sessions: { single: { data: { id: "s1" }, error: null } },
    });
    const result = await startDraftSession("lobby1", db);
    expect(result).toEqual({ ok: true, sessionId: "s1" });
    expect(db.from("draft_sessions").insert).toBeDefined();
  });
});

describe("getDraftState / recordPick", () => {
  function makeSessionDb(overrides: { picks?: unknown[]; status?: string } = {}) {
    return makeDb({
      draft_sessions: {
        single: {
          data: {
            id: "s1",
            lobby_id: "lobby1",
            status: overrides.status ?? "picking",
            player_order: ["a", "b"],
            skipped_user_ids: [],
          },
          error: null,
        },
      },
      draft_picks: { list: overrides.picks ?? [] },
    });
  }

  it("reports the current turn for a fresh session", async () => {
    const db = makeSessionDb();
    const result = await getDraftState("s1", db);
    expect(result.ok).toBe(true);
    expect(result.currentTurn).toEqual({ forUserId: "a", slot: "kinetic", pickNumber: 1 });
    expect(result.complete).toBe(false);
  });

  it("returns not found for a missing session", async () => {
    const db = makeDb({ draft_sessions: { single: { data: null, error: null } } });
    const result = await getDraftState("missing", db);
    expect(result).toEqual({ ok: false, error: "Draft session not found" });
  });

  it("records a valid pick and reports incomplete", async () => {
    const db = makeSessionDb();
    const result = await recordPick("s1", "b", 111, undefined, db);
    expect(result).toEqual({ ok: true, complete: false });
  });

  it("rejects a self-pick without writing a row", async () => {
    const db = makeSessionDb();
    const result = await recordPick("s1", "a", 111, undefined, db);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/can't pick your own weapon/);
  });

  it("rejects picks once the session is no longer picking", async () => {
    const db = makeSessionDb({ status: "completed" });
    const result = await recordPick("s1", "b", 111, undefined, db);
    expect(result).toEqual({ ok: false, error: "This draft is no longer active" });
  });

  it("marks the session completed once the final pick lands", async () => {
    const existingPicks = [
      { for_user_id: "a", picked_by_user_id: "b", slot: "kinetic", item_hash: 1, pick_number: 1 },
      { for_user_id: "b", picked_by_user_id: "a", slot: "kinetic", item_hash: 2, pick_number: 2 },
      { for_user_id: "a", picked_by_user_id: "b", slot: "energy", item_hash: 3, pick_number: 3 },
      { for_user_id: "b", picked_by_user_id: "a", slot: "energy", item_hash: 4, pick_number: 4 },
      { for_user_id: "a", picked_by_user_id: "b", slot: "power", item_hash: 5, pick_number: 5 },
    ];
    const db = makeSessionDb({ picks: existingPicks });
    // Only the last turn (b:power) remains — a picks the final weapon for b.
    const result = await recordPick("s1", "a", 999, undefined, db);
    expect(result).toEqual({ ok: true, complete: true });
  });
});
