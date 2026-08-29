/** @jest-environment node */
// Regression test: next-round inserted the round N+1 row and then advanced
// lobbies.current_round, checking neither error. supabase-js resolves with
// { error } rather than throwing, so a timed-out round insert was discarded
// and current_round still advanced - pointing the lobby at a round with no
// lobby_rounds row. lobby/state looks the round up by round_number and
// resolves roundId: null, wedging an in-progress lobby while the captain got
// { ok: true }.
//
// The insert is an upsert on (lobby_id, round_number) - the table's unique
// constraint from 001_initial.sql - so that a retry after a failed
// current_round update doesn't collide permanently. Mirrors the existing
// onConflict upsert in app/api/apply/route.ts.

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn(async () => ({ userId: "captain-1" })),
}));
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: jest.fn() },
}));

import { POST } from "@/app/api/lobby/next-round/route";
import { adminSupabase } from "@/lib/supabase/admin";

const mockFrom = adminSupabase.from as jest.Mock;
const LOBBY_ID = "11111111-2222-3333-4444-555555555555";

function makeReq() {
  return new Request("http://localhost/api/lobby/next-round", {
    method: "POST",
    body: JSON.stringify({ lobbyId: LOBBY_ID }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

type Opts = {
  roundWrite?: { error: unknown };
  lobbyUpdate?: { error: unknown };
};

function mockTables(opts: Opts = {}) {
  const calls = { roundUpsertOptions: null as unknown, currentRoundWritten: false };

  mockFrom.mockImplementation((table: string) => {
    if (table === "lobbies") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { captain_user_id: "captain-1", current_round: 1 },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            if ("current_round" in payload) calls.currentRoundWritten = true;
            return opts.lobbyUpdate ?? { error: null };
          },
        }),
      };
    }
    if (table === "lobby_rounds") {
      return {
        upsert: (_payload: unknown, options: unknown) => {
          calls.roundUpsertOptions = options;
          return Promise.resolve(opts.roundWrite ?? { error: null });
        },
        insert: () => Promise.resolve(opts.roundWrite ?? { error: null }),
      };
    }
    if (table === "lobby_members") {
      return { update: () => ({ eq: async () => ({ error: null }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return calls;
}

describe("POST /api/lobby/next-round", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("advances the round on the happy path", async () => {
    const calls = mockTables();

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, round: 2 });
    expect(calls.currentRoundWritten).toBe(true);
  });

  it("does not advance current_round when the round write fails", async () => {
    const calls = mockTables({
      roundWrite: { error: { message: "TimeoutError: The operation was aborted due to timeout" } },
    });

    const res = await POST(makeReq());

    expect(res.status).not.toBe(200);
    // The wedge: current_round must not move past a round that has no row.
    expect(calls.currentRoundWritten).toBe(false);
  });

  it("surfaces a failed current_round update instead of reporting ok", async () => {
    mockTables({ lobbyUpdate: { error: { message: "could not serialize access" } } });

    const res = await POST(makeReq());

    expect(res.status).not.toBe(200);
  });

  it("writes the round idempotently so a retry cannot collide", async () => {
    const calls = mockTables();

    await POST(makeReq());

    // (lobby_id, round_number) is unique; a plain insert would make any retry
    // after a partial failure fail permanently.
    expect(calls.roundUpsertOptions).toMatchObject({ onConflict: "lobby_id,round_number" });
  });
});
