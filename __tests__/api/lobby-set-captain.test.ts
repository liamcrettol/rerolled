/** @jest-environment node */
// Manual captaincy hand-off: the current captain picks a specific player
// instead of waiting for the per-round rotation.
//
// Authorization is checked against lobbies.captain_user_id rather than the
// caller's is_captain flag. That flag is derived state which assignCaptain
// rewrites in three non-transactional steps, so a lobby caught mid-hand-off
// can have nobody flagged - and gating on the flag would lock everyone out of
// the very control that fixes it.

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn(async () => ({ userId: "captain-1" })),
}));
jest.mock("@/lib/supabase/admin", () => ({ adminSupabase: { from: jest.fn() } }));
jest.mock("@/lib/lobby", () => ({ assignCaptain: jest.fn(async () => undefined) }));

import { POST } from "@/app/api/lobby/set-captain/route";
import { adminSupabase } from "@/lib/supabase/admin";
import { assignCaptain } from "@/lib/lobby";

const mockFrom = adminSupabase.from as jest.Mock;
const mockAssign = assignCaptain as jest.MockedFunction<typeof assignCaptain>;
const LOBBY_ID = "11111111-2222-3333-4444-555555555555";

function makeReq(userId: string, lobbyId: string = LOBBY_ID) {
  return new Request("http://localhost/api/lobby/set-captain", {
    method: "POST",
    body: JSON.stringify({ lobbyId, userId }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

type Opts = {
  lobby?: { captain_user_id: string; status: string; mode?: string } | null;
  target?: { id: string; user_id: string; is_spectator: boolean; display_name: string } | null;
};

function mockTables(opts: Opts) {
  const lobby = opts.lobby === undefined ? { captain_user_id: "captain-1", status: "waiting" } : opts.lobby;
  const target =
    opts.target === undefined
      ? { id: "m-2", user_id: "player-2", is_spectator: false, display_name: "Guardian#1234" }
      : opts.target;

  mockFrom.mockImplementation((table: string) => {
    if (table === "lobbies") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lobby, error: null }) }) }),
      };
    }
    if (table === "lobby_members") {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: target, error: null }) }) }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("POST /api/lobby/set-captain", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockAssign.mockClear();
  });

  it("hands captaincy to the chosen player", async () => {
    mockTables({});

    const res = await POST(makeReq("player-2"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, captainUserId: "player-2" });
    expect(mockAssign).toHaveBeenCalledWith(LOBBY_ID, { id: "m-2", user_id: "player-2" });
  });

  it("rejects a caller who is not the captain", async () => {
    mockTables({ lobby: { captain_user_id: "someone-else", status: "waiting" } });

    const res = await POST(makeReq("player-2"));

    expect(res.status).toBe(403);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects a target who is not in the lobby", async () => {
    mockTables({ target: null });

    const res = await POST(makeReq("ghost"));

    expect(res.status).toBe(404);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects a spectator as captain", async () => {
    mockTables({
      target: { id: "m-3", user_id: "player-3", is_spectator: true, display_name: "Watcher#1" },
    });

    const res = await POST(makeReq("player-3"));

    expect(res.status).toBe(400);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects passing captaincy to yourself", async () => {
    mockTables({});

    const res = await POST(makeReq("captain-1"));

    expect(res.status).toBe(400);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects a lobby that has ended", async () => {
    mockTables({ lobby: { captain_user_id: "captain-1", status: "done" } });

    const res = await POST(makeReq("player-2"));

    expect(res.status).toBe(409);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  // Draft lobbies never rotate captain_user_id (lib/draft/optionsService.ts'
  // requireStarter depends on it staying put - it's the only authorization
  // check for who may reveal a slot's candidates). /api/apply already excludes
  // draft mode from its own auto-rotation path for the same reason; this
  // manual hand-off must not be a back door around that invariant.
  it("rejects reassigning captaincy in a draft lobby", async () => {
    mockTables({ lobby: { captain_user_id: "captain-1", status: "waiting", mode: "draft" } });

    const res = await POST(makeReq("player-2"));

    expect(res.status).toBe(400);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown lobby", async () => {
    mockTables({ lobby: null });

    const res = await POST(makeReq("player-2"));

    expect(res.status).toBe(404);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("surfaces a database timeout as a 503, not a generic 500", async () => {
    mockTables({});
    mockAssign.mockRejectedValueOnce(
      new Error("TimeoutError: The operation was aborted due to timeout")
    );

    const res = await POST(makeReq("player-2"));

    expect(res.status).toBe(503);
  });
});
