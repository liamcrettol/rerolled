import {
  rulesToChips,
  rerollCountFromRules,
  toPlatformChallenge,
  toPlatformLeaderboardEntry,
  toPlatformSeasonStats,
  emptySeasonStats,
  type LeaderboardRow,
  type PlayerSeasonStatsRow,
} from "@/lib/challenges/present";
import type { WeeklyChallenge, WeeklyChallengeRuleSet } from "@/types/challenges";

const rules: WeeklyChallengeRuleSet = [
  { key: "required_weapon_type", value: "Sidearm", chip: "SIDEARM REQUIRED", display: "Sidearm required" },
  { key: "allow_exotics", value: false, chip: "NO EXOTICS", display: "No exotics" },
  { key: "reroll_limit", value: 3, chip: "3 REROLLS", display: "3 rerolls" },
];

describe("rulesToChips", () => {
  it("maps chips and tones by rule key", () => {
    expect(rulesToChips(rules)).toEqual([
      { label: "SIDEARM REQUIRED", tone: "require" },
      { label: "NO EXOTICS", tone: "ban" },
      { label: "3 REROLLS", tone: "neutral" },
    ]);
  });

  it("treats allow_exotics=true as neutral and handles missing rules", () => {
    expect(rulesToChips([{ key: "allow_exotics", value: true, chip: "EXOTICS OK", display: "" }]))
      .toEqual([{ label: "EXOTICS OK", tone: "neutral" }]);
    expect(rulesToChips(null)).toEqual([]);
  });
});

describe("rerollCountFromRules", () => {
  it("reads the reroll_limit value, defaulting to 0", () => {
    expect(rerollCountFromRules(rules)).toBe(3);
    expect(rerollCountFromRules([])).toBe(0);
  });
});

describe("toPlatformChallenge", () => {
  const row = {
    id: "wc1",
    week_number: 42,
    title: "Sidearm Supremacy",
    slug: "sidearm-supremacy",
    activity_name_snapshot: "GM: Lightblade",
    activity_family: "gm",
    starts_at: "2026-07-01T00:00:00Z",
    ends_at: "2026-07-08T00:00:00Z",
    global_seed: "seed",
    status: "active",
    rules,
  } as unknown as WeeklyChallenge;

  it("maps a row + season key into the platform shape", () => {
    const c = toPlatformChallenge(row, "2026-summer");
    expect(c).toMatchObject({
      id: "wc1",
      weekNumber: 42,
      seasonKey: "2026-summer",
      activityName: "GM: Lightblade",
      activityFamily: "gm",
      rerollCount: 3,
      status: "active",
    });
    expect(c.rules).toHaveLength(3);
  });

  it("falls back when activity name/family are null", () => {
    const c = toPlatformChallenge(
      { ...row, activity_name_snapshot: null, activity_family: null } as unknown as WeeklyChallenge,
      "s",
    );
    expect(c.activityName).toBe("Activity TBD");
    expect(c.activityFamily).toBe("other");
  });
});

describe("toPlatformLeaderboardEntry", () => {
  it("maps a row, coercing score and falling back to the ordinal rank", () => {
    const row: LeaderboardRow = {
      user_id: "u1",
      score: "9840",
      rank: null,
      clear_time_seconds: 892,
      deaths: 0,
      users: { display_name: "Rivensbane" },
    };
    expect(toPlatformLeaderboardEntry(row, 1)).toEqual({
      rank: 1,
      userId: "u1",
      displayName: "Rivensbane",
      score: 9840,
      clearTimeSeconds: 892,
      deaths: 0,
      rolledWeaponKills: 0,
    });
  });

  it("uses the stored rank and a Guardian fallback name", () => {
    const row: LeaderboardRow = {
      user_id: "u2", score: 100, rank: 5, clear_time_seconds: null, deaths: null, users: null,
    };
    const e = toPlatformLeaderboardEntry(row, 99);
    expect(e.rank).toBe(5);
    expect(e.displayName).toBe("Guardian");
    expect(e.clearTimeSeconds).toBe(0);
  });
});

describe("toPlatformSeasonStats", () => {
  const season = { season_key: "2026-summer", season_key_ignored: "", display_name: "Summer 2026" } as { season_key: string; display_name: string };

  it("returns the empty summary for a user with no stats row", () => {
    expect(toPlatformSeasonStats(null, season, null)).toEqual(emptySeasonStats(season));
  });

  it("maps a stats row and best weapon", () => {
    const row: PlayerSeasonStatsRow = {
      total_runs: 18,
      total_weapon_kills: 1342,
      weekly_clears: 3,
      best_weekly_rank: 37,
    };
    expect(toPlatformSeasonStats(row, season, { name: "The Immortal", kills: 214 })).toEqual({
      seasonKey: "2026-summer",
      seasonName: "Summer 2026",
      totalRuns: 18,
      rouletteKills: 1342,
      weeklyChallengesCleared: 3,
      bestWeeklyPlacement: 37,
      bestWeapon: { name: "The Immortal", kills: 214 },
      matchHistory: [],
    });
  });
});
