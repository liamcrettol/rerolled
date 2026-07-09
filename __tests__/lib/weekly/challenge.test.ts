/** @jest-environment node */
/**
 * getActiveWeeklyChallenge's pillar filter (#296) - mirrors the mode-filter
 * test pattern already used for getActiveSessionForUser (#292). Confirms
 * the default stays "pve" (every existing caller is unaffected) and that
 * requesting "pvp" never returns a PvE row, using a fake query builder that
 * actually filters an in-memory row set rather than asserting call args.
 */
import { getActiveWeeklyChallenge } from "@/lib/weekly/challenge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

let rows: Row[] = [];

function makeQuery() {
  let filtered = [...rows];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      filtered = [...filtered].sort((a, b) =>
        opts.ascending ? a[col].localeCompare(b[col]) : b[col].localeCompare(a[col])
      );
      return builder;
    },
    limit: (n: number) => {
      filtered = filtered.slice(0, n);
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
  };
  return builder;
}

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: jest.fn(() => makeQuery()) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSupabaseTimeout: jest.fn((p: PromiseLike<any>) => Promise.resolve(p)),
}));

function challengeRow(overrides: Row = {}): Row {
  return {
    id: "c1",
    week_number: 1,
    title: "Week 1",
    slug: "season-0-week-1",
    pillar: "pve",
    status: "active",
    activity_hash: 123,
    activity_name_snapshot: "Vault of Glass",
    activity_mode: 4,
    activity_family: "raid",
    starts_at: "2026-07-01T17:00:00Z",
    ends_at: "2026-07-08T17:00:00Z",
    rules: [],
    global_seed: "seed",
    seasons: { season_key: "season-0" },
    ...overrides,
  };
}

beforeEach(() => {
  rows = [];
});

describe("getActiveWeeklyChallenge", () => {
  it("defaults to the pve pillar", async () => {
    rows = [challengeRow({ id: "pve-1", pillar: "pve" })];
    const result = await getActiveWeeklyChallenge();
    expect(result?.id).toBe("pve-1");
  });

  it("never returns a PvE row when pillar='pvp' is requested", async () => {
    rows = [challengeRow({ id: "pve-1", pillar: "pve" })];
    const result = await getActiveWeeklyChallenge("pvp");
    expect(result).toBeNull();
  });

  it("returns the matching PvP row when both pillars have an active challenge", async () => {
    rows = [
      challengeRow({ id: "pve-1", pillar: "pve", slug: "season-0-week-1" }),
      challengeRow({ id: "pvp-1", pillar: "pvp", slug: "season-0-week-1-pvp", activity_family: "crucible" }),
    ];

    const pve = await getActiveWeeklyChallenge("pve");
    const pvp = await getActiveWeeklyChallenge("pvp");

    expect(pve?.id).toBe("pve-1");
    expect(pvp?.id).toBe("pvp-1");
  });

  it("returns null when there's no active challenge for the requested pillar", async () => {
    rows = [];
    const result = await getActiveWeeklyChallenge("pvp");
    expect(result).toBeNull();
  });
});
