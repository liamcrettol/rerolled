/** @jest-environment node */
// Regression test: createLobby's third insert (the round-1 lobby_rounds row)
// ignored its error entirely. supabase-js resolves with { error } rather than
// throwing, so a timed-out or failed round insert was silently discarded and
// createLobby still returned a "created" lobby. lobby/state then resolves
// roundId: null forever (next-round only ever inserts round N+1, nothing
// backfills round 1), so the lobby is permanently unrollable while the UI
// reports a successful creation.

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: jest.fn() },
}));

import { createLobby } from "@/lib/lobby";
import { adminSupabase } from "@/lib/supabase/admin";

const mockFrom = adminSupabase.from as jest.Mock;

function mockTables(roundsInsertResult: { data: unknown; error: unknown }) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "lobbies") {
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: { id: "lobby-1", code: "ABCDEF", mode: "roulette" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "lobby_members") {
      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({ data: { id: "member-1", ...payload }, error: null }),
          }),
        }),
      };
    }
    if (table === "lobby_rounds") {
      return { insert: async () => roundsInsertResult };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("createLobby", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("creates the round-1 row on the happy path", async () => {
    mockTables({ data: null, error: null });

    const { lobby } = await createLobby("user-1", "Guardian", 3, "bungie-1");

    expect(lobby.id).toBe("lobby-1");
  });

  it("throws instead of returning a roundless lobby when the round insert times out", async () => {
    mockTables({
      data: null,
      error: { message: "TimeoutError: The operation was aborted due to timeout" },
    });

    await expect(createLobby("user-1", "Guardian", 3, "bungie-1")).rejects.toThrow(
      /aborted due to timeout/
    );
  });

  it("throws when the round insert fails for any other reason", async () => {
    mockTables({ data: null, error: { message: "permission denied for table lobby_rounds" } });

    await expect(createLobby("user-1", "Guardian", 3, "bungie-1")).rejects.toThrow(
      /permission denied/
    );
  });
});
