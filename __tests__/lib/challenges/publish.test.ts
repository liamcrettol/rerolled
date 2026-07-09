/** @jest-environment node */
/**
 * publishWeeklyChallenge's active-window overlap check (#296). Its own
 * overlap MATH is already covered pure-function-style in validate.test.ts -
 * this covers the query that FEEDS it, which needs to be scoped by pillar:
 * PvE and PvP run concurrently by design, so an unscoped query would
 * false-positive every PvP publish as "overlapping" the always-active PvE
 * week (and vice versa).
 */
import { publishWeeklyChallenge } from "@/lib/challenges/publish";
import { requiredWeaponTypeRule } from "@/lib/challenges/rules";
import type { ScoringConfig } from "@/types/challenges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFakeSupabase(tables: Record<string, Row[]>): any {
  let autoId = 1;
  return {
    from(table: string) {
      const rows: Row[] = tables[table] ?? (tables[table] = []);
      let filtered = [...rows];
      let mode: "list" | "single" | "count" = "list";
      let insertPayload: Row | null = null;
      let updatePayload: Row | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: (_cols?: string, opts?: { count?: string }) => {
          if (opts?.count) mode = "count";
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        insert: (payload: Row) => {
          insertPayload = { id: `row-${autoId++}`, ...payload };
          return builder;
        },
        update: (payload: Row) => {
          updatePayload = payload;
          return builder;
        },
        single: () => {
          mode = "single";
          return builder;
        },
        maybeSingle: () => {
          mode = "single";
          return builder;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any, reject?: any) => {
          if (insertPayload) {
            rows.push(insertPayload);
            return Promise.resolve({ data: insertPayload, error: null }).then(resolve, reject);
          }
          if (updatePayload) {
            for (const row of rows) if (filtered.includes(row)) Object.assign(row, updatePayload);
            return Promise.resolve({
              data: mode === "single" ? filtered[0] ?? null : filtered,
              error: null,
            }).then(resolve, reject);
          }
          if (mode === "count") {
            return Promise.resolve({ count: filtered.length, error: null }).then(resolve, reject);
          }
          return Promise.resolve({
            data: mode === "single" ? filtered[0] ?? null : filtered,
            error: null,
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const scoringConfig: ScoringConfig = {
  base_points_per_kill: 10,
  rolled_weapon_multiplier: 2,
  precision_kill_bonus: 5,
  death_penalty: -25,
  flawless_bonus: 500,
  completion_bonus: 1000,
};

function draftRow(overrides: Row = {}): Row {
  return {
    id: "draft-1",
    slug: "season-0-week-1-pvp",
    pillar: "pvp",
    status: "draft",
    title: "Week 1",
    activity_hash: 123,
    activity_name_snapshot: "Control",
    rules: [requiredWeaponTypeRule("Sidearm")],
    scoring_config: scoringConfig,
    ...overrides,
  };
}

describe("publishWeeklyChallenge — pillar-scoped overlap check (#296)", () => {
  it("does not false-positive a PvP publish as overlapping an already-active PvE week in the same window", async () => {
    const pveActive = {
      id: "pve-1",
      slug: "season-0-week-1",
      pillar: "pve",
      status: "active",
      starts_at: "2026-06-30T17:00:00.000Z",
      ends_at: "2026-07-07T17:00:00.000Z",
    };
    const db = makeFakeSupabase({
      weekly_challenges: [pveActive, draftRow()],
      weekly_challenge_versions: [],
    });

    const result = await publishWeeklyChallenge(db, {
      slug: "season-0-week-1-pvp",
      // Deliberately the exact same window as the active PvE week.
      startsAt: "2026-06-30T17:00:00.000Z",
      endsAt: "2026-07-07T17:00:00.000Z",
    });

    expect(result.challenge.status).toBe("scheduled");
  });

  it("still rejects a PvP publish that overlaps an already-active PvP week", async () => {
    const pvpActive = {
      id: "pvp-active",
      slug: "season-0-week-0-pvp",
      pillar: "pvp",
      status: "active",
      starts_at: "2026-06-24T17:00:00.000Z",
      ends_at: "2026-07-01T18:00:00.000Z",
    };
    const db = makeFakeSupabase({
      weekly_challenges: [pvpActive, draftRow()],
      weekly_challenge_versions: [],
    });

    await expect(
      publishWeeklyChallenge(db, {
        slug: "season-0-week-1-pvp",
        startsAt: "2026-06-30T17:00:00.000Z", // overlaps pvpActive's window
        endsAt: "2026-07-07T17:00:00.000Z",
      })
    ).rejects.toThrow(/overlaps/);
  });
});
