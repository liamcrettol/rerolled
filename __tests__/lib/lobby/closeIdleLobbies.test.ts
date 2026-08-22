/** @jest-environment node */
/**
 * Bug found during the 2026-08-22 production health audit: closeIdleLobbies
 * only looked at last_active_at (set once, at apply time, never refreshed
 * while a client waits for detection) to decide what to mark "done." A lobby
 * whose match had been applied but not yet detected for >2h - a slow/failed
 * PGCR lookup, not an abandoned lobby - got closed and permanently excluded
 * from detect-games, silently losing that game's stats. Both callers
 * (detect-games' own idle-close and the separate cleanup-lobbies cron) must
 * exclude lobbies still awaiting detection from the idle-close sweep.
 */
import { closeIdleLobbies, getLobbyIdsAwaitingDetection } from "@/lib/lobby";

interface LobbyRow {
  id: string;
  status: string;
  last_active_at: string;
}

let rollHistoryRows: Array<{ lobby_id: string; round_id: string; applied_at: string }> = [];
let gameSessionRows: Array<{ lobby_id: string; played_at: string }> = [];
let lobbyRows: LobbyRow[] = [];
let updatedLobbyIds: string[] = [];

function makeRollHistoryQuery() {
  let rows = [...rollHistoryRows];
  const builder = {
    select: () => builder,
    not: () => builder,
    gte: (col: string, val: string) => {
      rows = rows.filter((r) => (r as any)[col] >= val);
      return builder;
    },
    order: () => builder,
    limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
  };
  return builder;
}

function makeGameSessionsQuery() {
  let rows = [...gameSessionRows];
  const builder = {
    select: () => builder,
    in: (col: string, ids: string[]) => {
      rows = rows.filter((r) => ids.includes((r as any)[col]));
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return builder;
}

function makeLobbiesUpdateQuery() {
  let candidates = [...lobbyRows];
  const builder: any = {
    update: () => builder,
    neq: (col: string, val: unknown) => {
      candidates = candidates.filter((r) => (r as any)[col] !== val);
      return builder;
    },
    lt: (col: string, val: string) => {
      candidates = candidates.filter((r) => (r as any)[col] < val);
      return builder;
    },
    notIn: (col: string, ids: string[]) => {
      candidates = candidates.filter((r) => !ids.includes((r as any)[col]));
      return builder;
    },
    select: () => Promise.resolve({ data: candidates, error: null }),
    then: (resolve: any, reject?: any) => {
      updatedLobbyIds = candidates.map((r) => r.id);
      return Promise.resolve({ data: candidates, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn((table: string) => {
      if (table === "roll_history") return makeRollHistoryQuery();
      if (table === "game_sessions") return makeGameSessionsQuery();
      if (table === "lobbies") return makeLobbiesUpdateQuery();
      throw new Error(`unexpected table ${table}`);
    }),
  },
}));

beforeEach(() => {
  rollHistoryRows = [];
  gameSessionRows = [];
  lobbyRows = [];
  updatedLobbyIds = [];
});

describe("getLobbyIdsAwaitingDetection", () => {
  it("returns lobbies with an apply but no session recorded after it", async () => {
    rollHistoryRows = [{ lobby_id: "L1", round_id: "R1", applied_at: "2026-08-22T10:00:00Z" }];
    gameSessionRows = [];

    const { pending, error } = await getLobbyIdsAwaitingDetection("2026-08-22T00:00:00Z");

    expect(error).toBeNull();
    expect(pending).toEqual([{ lobbyId: "L1", roundId: "R1", appliedAt: "2026-08-22T10:00:00Z" }]);
  });

  it("excludes a lobby whose session already covers the apply", async () => {
    rollHistoryRows = [{ lobby_id: "L1", round_id: "R1", applied_at: "2026-08-22T10:00:00Z" }];
    gameSessionRows = [{ lobby_id: "L1", played_at: "2026-08-22T10:05:00Z" }];

    const { pending } = await getLobbyIdsAwaitingDetection("2026-08-22T00:00:00Z");

    expect(pending).toEqual([]);
  });
});

describe("closeIdleLobbies exclusion", () => {
  it("does not close a lobby that is still awaiting PGCR detection, even if idle", async () => {
    lobbyRows = [
      { id: "L1", status: "waiting", last_active_at: "2026-08-22T01:00:00Z" }, // idle, awaiting detection
      { id: "L2", status: "waiting", last_active_at: "2026-08-22T01:00:00Z" }, // idle, truly abandoned
    ];

    await closeIdleLobbies("2026-08-22T05:00:00Z", "2026-08-22T09:00:00Z", ["L1"]);

    expect(updatedLobbyIds).toEqual(["L2"]);
  });

  it("closes everything idle when nothing is awaiting detection", async () => {
    lobbyRows = [{ id: "L2", status: "waiting", last_active_at: "2026-08-22T01:00:00Z" }];

    await closeIdleLobbies("2026-08-22T05:00:00Z", "2026-08-22T09:00:00Z", []);

    expect(updatedLobbyIds).toEqual(["L2"]);
  });
});
