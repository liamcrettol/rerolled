/** @jest-environment node */
/**
 * getActiveSessionForUser (#292): the dashboard's generic "resume any active
 * lobby" banner needs the single most-recently-active lobby across every
 * mode, but a mode-specific page can need its own active
 * lobby even when a different-mode lobby was touched more recently. Pins
 * both behaviors against a fake Supabase query builder that actually filters
 * an in-memory row set, rather than asserting on call arguments.
 */
import { getActiveSessionForUser } from "@/lib/lobby";

interface LobbyRow {
  id: string;
  code: string;
  status: string;
  mode: string;
  last_active_at: string;
}

let membershipRows: Array<{ lobby_id: string; user_id: string }> = [];
let lobbyRows: LobbyRow[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeQuery(rows: any[]) {
  let filtered = [...rows];
  let singleMode = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    in: (col: string, ids: string[]) => {
      filtered = filtered.filter((r) => ids.includes(r[col]));
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    neq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] !== val);
      return builder;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      filtered = [...filtered].sort((a, b) => {
        const cmp = String(a[col]).localeCompare(String(b[col]));
        return opts.ascending ? cmp : -cmp;
      });
      return builder;
    },
    limit: (n: number) => {
      filtered = filtered.slice(0, n);
      return builder;
    },
    maybeSingle: () => {
      singleMode = true;
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (resolve: any, reject?: any) =>
      Promise.resolve({ data: singleMode ? filtered[0] ?? null : filtered, error: null }).then(
        resolve,
        reject
      ),
  };
  return builder;
}

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn((table: string) => {
      if (table === "lobby_members") return makeQuery(membershipRows);
      if (table === "lobbies") return makeQuery(lobbyRows);
      throw new Error(`unexpected table ${table}`);
    }),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSupabaseTimeout: jest.fn((p: PromiseLike<any>) => Promise.resolve(p)),
}));

beforeEach(() => {
  membershipRows = [
    { lobby_id: "L1", user_id: "user-1" },
    { lobby_id: "L2", user_id: "user-1" },
  ];
  lobbyRows = [
    { id: "L1", code: "AAAA", status: "active", mode: "roulette", last_active_at: "2026-07-09T12:00:00Z" },
    { id: "L2", code: "BBBB", status: "active", mode: "draft", last_active_at: "2026-07-09T10:00:00Z" },
  ];
});

describe("getActiveSessionForUser", () => {
  it("without a mode filter, returns the most-recently-active lobby across all modes", async () => {
    const result = await getActiveSessionForUser("user-1");
    expect(result).toEqual({ code: "AAAA", status: "active", mode: "roulette" });
  });

  it("with a mode filter, returns that mode's active lobby even when a different mode was touched more recently", async () => {
    const result = await getActiveSessionForUser("user-1", "draft");
    expect(result).toEqual({ code: "BBBB", status: "active", mode: "draft" });
  });

  it("returns null when the user has no lobby in the requested mode", async () => {
    lobbyRows = lobbyRows.filter((r) => r.mode !== "draft");
    const result = await getActiveSessionForUser("user-1", "draft");
    expect(result).toBeNull();
  });

  it("excludes done lobbies", async () => {
    lobbyRows = [{ id: "L2", code: "BBBB", status: "done", mode: "draft", last_active_at: "2026-07-09T10:00:00Z" }];
    const result = await getActiveSessionForUser("user-1", "draft");
    expect(result).toBeNull();
  });

  it("returns null when the user has no lobby memberships", async () => {
    membershipRows = [];
    const result = await getActiveSessionForUser("user-1");
    expect(result).toBeNull();
  });
});
