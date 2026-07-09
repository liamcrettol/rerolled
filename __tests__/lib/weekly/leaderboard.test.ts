/** @jest-environment node */
import { getUserWeeklyPlacement, getWeeklyRunCount } from "@/lib/weekly/leaderboard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const tables: Record<string, Row[]> = {
  challenge_runs: [],
  weekly_leaderboard_entries: [],
};

function makeQuery(table: string) {
  let filtered = [...tables[table]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === "exact" && opts?.head) {
        builder.__countMode = true;
      }
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return builder;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      filtered = [...filtered].sort((a, b) =>
        opts.ascending
          ? String(a[col]).localeCompare(String(b[col]))
          : String(b[col]).localeCompare(String(a[col]))
      );
      return builder;
    },
    limit: (n: number) => {
      filtered = filtered.slice(0, n);
      return builder;
    },
    maybeSingle: () =>
      Promise.resolve(
        builder.__countMode
          ? { count: filtered.length, error: null }
          : { data: filtered[0] ?? null, error: null }
      ),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(
        builder.__countMode
          ? { count: filtered.length, error: null }
          : { data: filtered, error: null }
      ).then(resolve),
  };
  return builder;
}

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: (table: string) => makeQuery(table),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSupabaseTimeout: jest.fn((p: PromiseLike<any>) => Promise.resolve(p)),
}));

beforeEach(() => {
  tables.challenge_runs = [];
  tables.weekly_leaderboard_entries = [];
});

describe("weekly leaderboard counters", () => {
  it("counts only completed weekly runs for the hero counter", async () => {
    tables.challenge_runs = [
      { id: "r1", weekly_challenge_id: "wc1", status: "created" },
      { id: "r2", weekly_challenge_id: "wc1", status: "expired" },
      { id: "r3", weekly_challenge_id: "wc1", status: "scored" },
      { id: "r4", weekly_challenge_id: "wc1", status: "finalized" },
      { id: "r5", weekly_challenge_id: "wc2", status: "scored" },
    ];

    await expect(getWeeklyRunCount("wc1")).resolves.toBe(2);
  });

  it("counts only the viewer's completed weekly runs in placement metadata", async () => {
    tables.challenge_runs = [
      { id: "r1", weekly_challenge_id: "wc1", created_by: "u1", status: "expired" },
      { id: "r2", weekly_challenge_id: "wc1", created_by: "u1", status: "scored" },
      { id: "r3", weekly_challenge_id: "wc1", created_by: "u1", status: "created" },
      { id: "r4", weekly_challenge_id: "wc1", created_by: "u2", status: "finalized" },
    ];
    tables.weekly_leaderboard_entries = [];

    await expect(getUserWeeklyPlacement("u1", "wc1")).resolves.toEqual({
      rank: null,
      bestScore: null,
      totalRuns: 1,
    });
  });
});
