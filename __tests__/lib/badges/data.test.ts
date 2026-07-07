/** @jest-environment node */
import { getUserBadges, getBadgeCatalog } from "@/lib/badges/data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let playerBadgesResult: any = { data: [], error: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let catalogResult: any = { data: [], error: null };

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => Promise.resolve(table === "player_badges" ? playerBadgesResult : catalogResult),
      };
      return builder;
    },
  },
}));

const badgeRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  slug: "core_drawn",
  name: "Drawn",
  description: "Complete your first activity.",
  category: "completion",
  tier: "bronze",
  mode: "core",
  icon_key: "laurel",
  is_active: true,
  is_hidden: false,
  sort_order: 100,
  ...overrides,
});

describe("getUserBadges", () => {
  afterEach(() => {
    playerBadgesResult = { data: [], error: null };
  });

  it("maps earned rows into DisplayBadge, including the user's own hidden badges", async () => {
    playerBadgesResult = {
      data: [
        {
          earned_at: "2026-01-01T00:00:00Z",
          source_run_id: "run1",
          source_weekly_challenge_id: null,
          season_id: null,
          badges: badgeRow(),
        },
        {
          earned_at: "2026-01-02T00:00:00Z",
          source_run_id: "run2",
          source_weekly_challenge_id: null,
          season_id: null,
          badges: badgeRow({ slug: "core_forfeit", is_hidden: true }),
        },
      ],
      error: null,
    };

    const result = await getUserBadges("user1");
    expect(result).toHaveLength(2);
    expect(result[1].slug).toBe("core_forfeit");
    expect(result[1].status).toBe("hidden");
    expect(result[0].status).toBe("earned");
  });

  it("drops rows whose badge has been deactivated", async () => {
    playerBadgesResult = {
      data: [
        { earned_at: "2026-01-01T00:00:00Z", source_run_id: null, source_weekly_challenge_id: null, season_id: null, badges: badgeRow({ is_active: false }) },
      ],
      error: null,
    };
    const result = await getUserBadges("user1");
    expect(result).toHaveLength(0);
  });

  it("degrades to an empty list on a query error", async () => {
    playerBadgesResult = { data: null, error: { message: "boom" } };
    const result = await getUserBadges("user1");
    expect(result).toEqual([]);
  });
});

describe("getBadgeCatalog", () => {
  afterEach(() => {
    playerBadgesResult = { data: [], error: null };
    catalogResult = { data: [], error: null };
  });

  it("never includes an unearned hidden badge", async () => {
    catalogResult = {
      data: [
        badgeRow({ slug: "core_drawn", is_hidden: false }),
        badgeRow({ slug: "core_forfeit", is_hidden: true, sort_order: 190 }),
      ],
      error: null,
    };
    playerBadgesResult = { data: [], error: null }; // nothing earned

    const result = await getBadgeCatalog("user1");
    expect(result.map((b) => b.slug)).toEqual(["core_drawn"]);
  });

  it("includes a hidden badge once the user has earned it, marked earned", async () => {
    catalogResult = {
      data: [badgeRow({ slug: "core_forfeit", is_hidden: true, sort_order: 190 })],
      error: null,
    };
    playerBadgesResult = {
      data: [
        {
          earned_at: "2026-01-01T00:00:00Z",
          source_run_id: "run1",
          source_weekly_challenge_id: null,
          season_id: null,
          badges: badgeRow({ slug: "core_forfeit", is_hidden: true, sort_order: 190 }),
        },
      ],
      error: null,
    };

    const result = await getBadgeCatalog("user1");
    expect(result).toHaveLength(1);
    expect(result[0].earned).toBe(true);
    expect(result[0].earnedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("marks non-hidden unearned badges as locked (earned: false) without dropping them", async () => {
    catalogResult = { data: [badgeRow({ slug: "crucible_writ", mode: "crucible", sort_order: 200 })], error: null };
    playerBadgesResult = { data: [], error: null };

    const result = await getBadgeCatalog("user1");
    expect(result).toEqual([
      expect.objectContaining({ slug: "crucible_writ", earned: false, earnedAt: null }),
    ]);
  });
});
