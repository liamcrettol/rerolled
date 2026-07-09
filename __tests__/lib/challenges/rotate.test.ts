/** @jest-environment node */
import { nextWeeklyReset, rotateWeeklyChallenges } from "@/lib/challenges/rotate";
import { generateWeeklyChallengeAndStoreDraft, publishWeeklyChallenge } from "@/lib/challenges/publish";

jest.mock("@/lib/challenges/publish", () => ({
  generateWeeklyChallengeAndStoreDraft: jest.fn(),
  publishWeeklyChallenge: jest.fn(),
}));

// Destiny weekly reset: Tuesday 17:00 UTC.
describe("nextWeeklyReset", () => {
  it("rolls forward to Tuesday 17:00 from mid-week", () => {
    // Friday 2026-07-03 12:00 UTC → Tuesday 2026-07-07 17:00 UTC
    const next = nextWeeklyReset(new Date("2026-07-03T12:00:00Z"));
    expect(next.toISOString()).toBe("2026-07-07T17:00:00.000Z");
  });

  it("uses the same day when it's Tuesday before reset", () => {
    const next = nextWeeklyReset(new Date("2026-07-07T10:00:00Z"));
    expect(next.toISOString()).toBe("2026-07-07T17:00:00.000Z");
  });

  it("skips a full week when it's Tuesday at/after reset", () => {
    expect(nextWeeklyReset(new Date("2026-07-07T17:00:00Z")).toISOString()).toBe(
      "2026-07-14T17:00:00.000Z"
    );
    expect(nextWeeklyReset(new Date("2026-07-07T18:30:00Z")).toISOString()).toBe(
      "2026-07-14T17:00:00.000Z"
    );
  });

  it("always returns a strictly future instant", () => {
    for (let d = 0; d < 7; d++) {
      const now = new Date(Date.UTC(2026, 6, 1 + d, 17, 0, 0));
      expect(nextWeeklyReset(now).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

// ── rotateWeeklyChallenges pillar independence (#296) ───────────────────────
// A minimal fake Supabase client covering exactly the query shapes
// rotateWeeklyChallenges uses against weekly_challenges/seasons (select/eq/
// lte/gt/order/limit/maybeSingle/update), backed by real in-memory filtering
// so pillar scoping is actually exercised, not just asserted on call args.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFakeSupabase(tables: Record<string, Row[]>): any {
  return {
    from(table: string) {
      const rows: Row[] = tables[table] ?? [];
      let filtered = [...rows];
      let singleMode = false;
      let updatePayload: Row | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        lte: (col: string, val: string) => {
          filtered = filtered.filter((r) => String(r[col]) <= val);
          return builder;
        },
        gt: (col: string, val: string) => {
          filtered = filtered.filter((r) => String(r[col]) > val);
          return builder;
        },
        order: (col: string, opts: { ascending: boolean }) => {
          filtered = [...filtered].sort((a, b) =>
            opts.ascending ? a[col] - b[col] : b[col] - a[col]
          );
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
        update: (payload: Row) => {
          updatePayload = payload;
          return builder;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any, reject?: any) => {
          if (updatePayload) {
            for (const row of rows) {
              if (filtered.includes(row)) Object.assign(row, updatePayload);
            }
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: singleMode ? filtered[0] ?? null : filtered, error: null }).then(
            resolve,
            reject
          );
        },
      };
      return builder;
    },
  };
}

function challengeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "c1",
    slug: "season-0-week-1",
    season_id: "s1",
    pillar: "pve",
    status: "active",
    week_number: 1,
    starts_at: "2026-07-01T17:00:00.000Z",
    ends_at: "2026-07-08T17:00:00.000Z",
    ...overrides,
  };
}

const mockGenerate = generateWeeklyChallengeAndStoreDraft as jest.MockedFunction<
  typeof generateWeeklyChallengeAndStoreDraft
>;
const mockPublish = publishWeeklyChallenge as jest.MockedFunction<typeof publishWeeklyChallenge>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("rotateWeeklyChallenges — pillar independence (#296)", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");

  it("activating a scheduled PvP week does not touch an already-active PvE week", async () => {
    const pveActive = challengeRow({ id: "pve-1", slug: "season-0-week-3-pve", pillar: "pve", status: "active" });
    const pvpScheduled = challengeRow({
      id: "pvp-1",
      slug: "season-0-week-3-pvp",
      pillar: "pvp",
      status: "scheduled",
      starts_at: "2026-07-01T00:00:00.000Z",
      ends_at: "2026-07-08T17:00:00.000Z",
    });
    const db = makeFakeSupabase({ weekly_challenges: [pveActive, pvpScheduled] });

    const result = await rotateWeeklyChallenges(db, now, "pvp");

    expect(result.activated).toEqual(["season-0-week-3-pvp"]);
    expect(pvpScheduled.status).toBe("active");
    expect(pveActive.status).toBe("active"); // untouched, not reprocessed
  });

  it("a PvE active week does not block PvP from generating its own week (both can share the same window)", async () => {
    const pveActive = challengeRow({ id: "pve-1", pillar: "pve", status: "active" });
    const db = makeFakeSupabase({
      weekly_challenges: [pveActive],
      seasons: [{ id: "s1", season_key: "season-0", status: "active", ends_at: "2027-01-01T00:00:00.000Z" }],
    });
    mockGenerate.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draft: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      challenge: { id: "pvp-new", slug: "season-0-week-1-pvp" } as any,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPublish.mockResolvedValue({ challenge: {} as any, versionId: "v1" });

    const result = await rotateWeeklyChallenges(db, now, "pvp");

    expect(result.skipped).toBeNull();
    expect(result.generated).toBe("season-0-week-1-pvp");
    expect(mockGenerate).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ pillar: "pvp", weekNumber: 1 })
    );
  });

  it("derives the next week number independently per pillar", async () => {
    const db = makeFakeSupabase({
      weekly_challenges: [
        challengeRow({ id: "pve-5", pillar: "pve", week_number: 5, status: "expired" }),
        challengeRow({ id: "pvp-2", pillar: "pvp", week_number: 2, status: "expired" }),
      ],
      seasons: [{ id: "s1", season_key: "season-0", status: "active", ends_at: "2027-01-01T00:00:00.000Z" }],
    });
    mockGenerate.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draft: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      challenge: { id: "pvp-new", slug: "season-0-week-3-pvp" } as any,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPublish.mockResolvedValue({ challenge: {} as any, versionId: "v1" });

    await rotateWeeklyChallenges(db, now, "pvp");

    // PvP's latest week is 2, so the next one is 3 - NOT 6 (which would be
    // the case if the "latest week number" query read PvE's counter).
    expect(mockGenerate).toHaveBeenCalledWith(db, expect.objectContaining({ weekNumber: 3 }));
  });

  it("publishes PvP with the same Tuesday reset boundary as PvE", async () => {
    const db = makeFakeSupabase({
      weekly_challenges: [],
      seasons: [{ id: "s1", season_key: "season-0", status: "active", ends_at: "2027-01-01T00:00:00.000Z" }],
    });
    mockGenerate.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draft: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      challenge: { id: "pvp-new", slug: "season-0-week-1-pvp" } as any,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPublish.mockResolvedValue({ challenge: {} as any, versionId: "v1" });

    await rotateWeeklyChallenges(db, now, "pvp");

    expect(mockPublish).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        slug: "season-0-week-1-pvp",
        endsAt: "2026-07-07T17:00:00.000Z",
      })
    );
  });
});
