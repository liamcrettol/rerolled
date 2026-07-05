import { badgeEvaluators, buildPlayerBadgeInsert, evaluateBadges } from "@/lib/badges/evaluators";
import { BADGE_SLUGS } from "@/lib/badges/catalog";
import type { ChallengeRun, ChallengeRunLoadoutSlot } from "@/types/challenges";

function makeRun(overrides: Partial<ChallengeRun> = {}): ChallengeRun {
  return {
    id: "run-1",
    mode: "weekly_challenge",
    status: "finalized",
    weekly_challenge_id: "wc-1",
    weekly_challenge_version_id: "wcv-1",
    season_id: "season-1",
    lobby_id: null,
    round_id: null,
    activity_hash: null,
    pgcr_instance_id: null,
    started_at: null,
    completed_at: null,
    finalized_at: null,
    score: 100,
    scoring_breakdown: null,
    compliance_status: "eligible",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSlot(overrides: Partial<ChallengeRunLoadoutSlot> = {}): ChallengeRunLoadoutSlot {
  return {
    id: "slot-1",
    run_id: "run-1",
    slot: "kinetic",
    item_hash: 1,
    weapon_name: "Test Weapon",
    weapon_icon: null,
    weapon_type: null,
    damage_type: null,
    is_wildcard: false,
    reroll_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("badgeEvaluators.weekly_clear", () => {
  it("awards a one-time badge for a finalized weekly challenge run", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.WEEKLY_CLEAR]({ run: makeRun() });
    expect(decision).toEqual({ awarded: true, scopeKey: "once" });
  });

  it("does not award for a score_attack run", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.WEEKLY_CLEAR]({ run: makeRun({ mode: "score_attack", weekly_challenge_id: null }) });
    expect(decision.awarded).toBe(false);
  });

  it("does not award for a non-finalized run", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.WEEKLY_CLEAR]({ run: makeRun({ status: "scored" }) });
    expect(decision.awarded).toBe(false);
  });
});

describe("badgeEvaluators.pure_roll (compliance badge)", () => {
  it("awards when compliance is eligible with 100% weapon usage", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.PURE_ROLL]({
      run: makeRun(),
      complianceResult: { status: "eligible", weaponUsageRatio: 1 },
    });
    expect(decision).toEqual({ awarded: true, scopeKey: "wc-1" });
  });

  it("does not award when flagged even with high usage", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.PURE_ROLL]({
      run: makeRun(),
      complianceResult: { status: "flagged", weaponUsageRatio: 1 },
    });
    expect(decision.awarded).toBe(false);
  });

  it("does not award below 100% usage", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.PURE_ROLL]({
      run: makeRun(),
      complianceResult: { status: "eligible", weaponUsageRatio: 0.95 },
    });
    expect(decision.awarded).toBe(false);
  });
});

describe("badgeEvaluators.no_rerolls", () => {
  it("awards when every loadout slot has zero rerolls", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.NO_REROLLS]({
      run: makeRun(),
      loadoutSlots: [makeSlot({ slot: "kinetic" }), makeSlot({ slot: "energy" }), makeSlot({ slot: "power" })],
    });
    expect(decision.awarded).toBe(true);
  });

  it("does not award if any slot was rerolled", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.NO_REROLLS]({
      run: makeRun(),
      loadoutSlots: [makeSlot({ slot: "kinetic", reroll_count: 1 }), makeSlot({ slot: "energy" })],
    });
    expect(decision.awarded).toBe(false);
  });
});

describe("badgeEvaluators.top_10_percent_weekly (repeatable/scoped badge)", () => {
  it("awards for rank within the top 10%", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.TOP_10_PERCENT_WEEKLY]({
      run: makeRun(),
      leaderboardEntry: { rank: 5, totalEntries: 100 },
    });
    expect(decision).toEqual({ awarded: true, scopeKey: "wc-1" });
  });

  it("does not award for rank outside the top 10%", () => {
    const decision = badgeEvaluators[BADGE_SLUGS.TOP_10_PERCENT_WEEKLY]({
      run: makeRun(),
      leaderboardEntry: { rank: 50, totalEntries: 100 },
    });
    expect(decision.awarded).toBe(false);
  });

  it("scopes repeated awards by weekly_challenge_id so a second win awards again next week", () => {
    const week1 = badgeEvaluators[BADGE_SLUGS.TOP_10_PERCENT_WEEKLY]({
      run: makeRun({ weekly_challenge_id: "wc-1" }),
      leaderboardEntry: { rank: 1, totalEntries: 100 },
    });
    const week2 = badgeEvaluators[BADGE_SLUGS.TOP_10_PERCENT_WEEKLY]({
      run: makeRun({ weekly_challenge_id: "wc-2" }),
      leaderboardEntry: { rank: 1, totalEntries: 100 },
    });
    expect(week1.scopeKey).not.toEqual(week2.scopeKey);
  });
});

describe("badgeEvaluators.three_week_streak", () => {
  it("awards once the streak reaches three", () => {
    expect(badgeEvaluators[BADGE_SLUGS.THREE_WEEK_STREAK]({ run: makeRun(), currentStreak: 3 }).awarded).toBe(true);
  });

  it("does not award below a three-week streak", () => {
    expect(badgeEvaluators[BADGE_SLUGS.THREE_WEEK_STREAK]({ run: makeRun(), currentStreak: 2 }).awarded).toBe(false);
  });
});

describe("evaluateBadges", () => {
  it("returns only awarded badges for a fully-qualifying finalized run", () => {
    const results = evaluateBadges({
      run: makeRun(),
      loadoutSlots: [makeSlot()],
      complianceResult: { status: "eligible", weaponUsageRatio: 1 },
      leaderboardEntry: { rank: 1, totalEntries: 10 },
      currentStreak: 3,
    });
    const slugs = results.map((r) => r.slug).sort();
    expect(slugs).toEqual(
      [
        BADGE_SLUGS.WEEKLY_CLEAR,
        BADGE_SLUGS.PURE_ROLL,
        BADGE_SLUGS.NO_REROLLS,
        BADGE_SLUGS.TOP_10_PERCENT_WEEKLY,
        BADGE_SLUGS.THREE_WEEK_STREAK,
      ].sort()
    );
  });

  it("returns nothing for a run that qualifies for no badges", () => {
    const results = evaluateBadges({ run: makeRun({ status: "scored" }) });
    expect(results).toEqual([]);
  });
});

describe("buildPlayerBadgeInsert (idempotency contract)", () => {
  it("builds a row keyed by (user_id, badge_id, scope_key) for idempotent upserts", () => {
    const decision = { awarded: true, scopeKey: "wc-1", metadata: { rank: 1 } };
    const row = buildPlayerBadgeInsert("user-1", "1234", "badge-uuid", decision, {
      runId: "run-1",
      weeklyChallengeId: "wc-1",
      seasonId: "season-1",
    });

    expect(row).toEqual({
      user_id: "user-1",
      bungie_membership_id: "1234",
      badge_id: "badge-uuid",
      source_run_id: "run-1",
      source_weekly_challenge_id: "wc-1",
      season_id: "season-1",
      scope_key: "wc-1",
      metadata: { rank: 1 },
    });
  });

  it("produces identical rows for repeated calls with the same decision, making re-awarding a no-op via ON CONFLICT", () => {
    const decision = { awarded: true, scopeKey: "once" };
    const source = { runId: "run-1", weeklyChallengeId: null, seasonId: null };
    const first = buildPlayerBadgeInsert("user-1", null, "badge-uuid", decision, source);
    const second = buildPlayerBadgeInsert("user-1", null, "badge-uuid", decision, source);
    expect(first).toEqual(second);
  });
});
