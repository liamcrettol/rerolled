import { evaluateRerolledBadge, type RerolledBadgeContext } from "@/lib/badges/rerolledEvaluators";
import type { ChallengeRun, ChallengeRunLoadoutSlot, RunLegalityResult } from "@/types/challenges";

function makeRun(overrides: Partial<ChallengeRun> = {}): ChallengeRun {
  return {
    id: "run-1",
    mode: "score_attack",
    status: "finalized",
    weekly_challenge_id: null,
    weekly_challenge_version_id: null,
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

function makeLegality(overrides: Partial<RunLegalityResult> = {}): RunLegalityResult {
  return {
    id: "legality-1",
    run_id: "run-1",
    user_id: "user-1",
    is_valid: true,
    had_active_loadout: true,
    rolled_final_blows: 10,
    illegal_final_blows: 0,
    illegal_sources: [],
    rolled_weapons_used: [],
    evaluated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSlot(overrides: Partial<ChallengeRunLoadoutSlot> = {}): ChallengeRunLoadoutSlot {
  return {
    id: "slot-1",
    run_id: "run-1",
    slot: "kinetic",
    item_hash: 111,
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

function baseCtx(overrides: Partial<RerolledBadgeContext> = {}): RerolledBadgeContext {
  return {
    run: makeRun(),
    legality: makeLegality(),
    ...overrides,
  };
}

describe("evaluateRerolledBadge - dispatch", () => {
  it("throws when criteria has no rule key", () => {
    expect(() => evaluateRerolledBadge({}, baseCtx())).toThrow(/missing a "rule" key/);
  });

  it("throws for an unknown rule", () => {
    expect(() => evaluateRerolledBadge({ rule: "does_not_exist" }, baseCtx())).toThrow(/unknown badge rule/);
  });

  it("throws for manual_grant (not run-evaluated)", () => {
    expect(() => evaluateRerolledBadge({ rule: "manual_grant" }, baseCtx())).toThrow(/admin path/);
  });

  it("throws for rules with no evaluator yet", () => {
    expect(() => evaluateRerolledBadge({ rule: "round_final_blow_lead" }, baseCtx())).toThrow(/no evaluator yet/);
    expect(() => evaluateRerolledBadge({ rule: "no_round_illegal" }, baseCtx())).toThrow(/no evaluator yet/);
    expect(() => evaluateRerolledBadge({ rule: "final_round_rolled_win" }, baseCtx())).toThrow(/no evaluator yet/);
    expect(() => evaluateRerolledBadge({ rule: "session_all_valid" }, baseCtx())).toThrow(/no evaluator yet/);
  });
});

describe("first_valid_run (core_drawn)", () => {
  it("awards once when the run is legality-valid", () => {
    const decision = evaluateRerolledBadge({ rule: "first_valid_run" }, baseCtx());
    expect(decision).toEqual({ awarded: true, scopeKey: "once" });
  });

  it("does not award when illegal final blows were recorded", () => {
    const decision = evaluateRerolledBadge(
      { rule: "first_valid_run" },
      baseCtx({ legality: makeLegality({ is_valid: false, illegal_final_blows: 2 }) })
    );
    expect(decision.awarded).toBe(false);
  });
});

describe("zero_illegal_final_blows (core_bound)", () => {
  it("scopes by run id so each valid match earns a separate row", () => {
    const decision = evaluateRerolledBadge({ rule: "zero_illegal_final_blows" }, baseCtx({ run: makeRun({ id: "run-42" }) }));
    expect(decision).toEqual({ awarded: true, scopeKey: "run-42" });
  });
});

describe("invalid_marker (core_forfeit)", () => {
  it("awards only when legality is explicitly invalid", () => {
    const invalid = evaluateRerolledBadge(
      { rule: "invalid_marker" },
      baseCtx({ legality: makeLegality({ is_valid: false, illegal_final_blows: 1, illegal_sources: ["melee"] }) })
    );
    expect(invalid.awarded).toBe(true);

    const valid = evaluateRerolledBadge({ rule: "invalid_marker" }, baseCtx());
    expect(valid.awarded).toBe(false);
  });
});

describe("all_rolled_weapons_used (core_threefold / pve_no_reserve)", () => {
  it("awards when every rolled weapon has a recorded final blow", () => {
    const decision = evaluateRerolledBadge(
      { rule: "all_rolled_weapons_used" },
      baseCtx({
        loadoutSlots: [makeSlot({ item_hash: 111, slot: "kinetic" }), makeSlot({ item_hash: 222, slot: "energy" })],
        legality: makeLegality({ rolled_weapons_used: [111, 222] }),
      })
    );
    expect(decision.awarded).toBe(true);
  });

  it("does not award when a rolled weapon has zero final blows", () => {
    const decision = evaluateRerolledBadge(
      { rule: "all_rolled_weapons_used" },
      baseCtx({
        loadoutSlots: [makeSlot({ item_hash: 111 }), makeSlot({ item_hash: 222, slot: "energy" })],
        legality: makeLegality({ rolled_weapons_used: [111] }),
      })
    );
    expect(decision.awarded).toBe(false);
  });

  it("respects an activity_family filter (pve group)", () => {
    const decision = evaluateRerolledBadge(
      { rule: "all_rolled_weapons_used", activity_family: "pve" },
      baseCtx({
        loadoutSlots: [makeSlot({ item_hash: 111 })],
        legality: makeLegality({ rolled_weapons_used: [111] }),
        activity: { family: "crucible", modeKey: null, isWin: null, isCompleted: null, defeats: null, teamPlacement: null, totalTeams: null, medalKeys: [], isUndefeated: null, isMercy: null, scoreLeadOnTeam: null, objectiveLeadOnTeam: null },
      })
    );
    expect(decision.awarded).toBe(false);
  });
});

describe("fireteam_all_valid (core_full_accord)", () => {
  it("awards only when every fireteam member's run is valid", () => {
    const allValid = evaluateRerolledBadge(
      { rule: "fireteam_all_valid" },
      baseCtx({ fireteamLegality: [makeLegality({ user_id: "a" }), makeLegality({ user_id: "b" })] })
    );
    expect(allValid.awarded).toBe(true);

    const oneInvalid = evaluateRerolledBadge(
      { rule: "fireteam_all_valid" },
      baseCtx({
        fireteamLegality: [makeLegality({ user_id: "a" }), makeLegality({ user_id: "b", is_valid: false })],
      })
    );
    expect(oneInvalid.awarded).toBe(false);
  });
});

describe("valid_streak (core_chain / core_unbroken_chain)", () => {
  it("awards once the streak reaches the required length", () => {
    expect(evaluateRerolledBadge({ rule: "valid_streak", length: 5 }, baseCtx({ currentValidStreak: 5 })).awarded).toBe(true);
    expect(evaluateRerolledBadge({ rule: "valid_streak", length: 5 }, baseCtx({ currentValidStreak: 4 })).awarded).toBe(false);
  });
});

describe("win_valid_activity (crucible_writ / iron_banner_ironbound)", () => {
  const activity = (overrides: Record<string, unknown> = {}) => ({
    family: "crucible" as const,
    modeKey: "control",
    isWin: true,
    isCompleted: true,
    defeats: 20,
    teamPlacement: 1,
    totalTeams: 2,
    medalKeys: [],
    isUndefeated: false,
    isMercy: false,
    scoreLeadOnTeam: false,
    objectiveLeadOnTeam: false,
    ...overrides,
  });

  it("awards a win in the matching activity_family", () => {
    const decision = evaluateRerolledBadge(
      { rule: "win_valid_activity", activity_family: "crucible" },
      baseCtx({ activity: activity() })
    );
    expect(decision.awarded).toBe(true);
  });

  it("does not award for the wrong activity_family", () => {
    const decision = evaluateRerolledBadge(
      { rule: "win_valid_activity", activity_family: "iron_banner" },
      baseCtx({ activity: activity() })
    );
    expect(decision.awarded).toBe(false);
  });

  it("does not award a loss", () => {
    const decision = evaluateRerolledBadge(
      { rule: "win_valid_activity", activity_family: "crucible" },
      baseCtx({ activity: activity({ isWin: false }) })
    );
    expect(decision.awarded).toBe(false);
  });

  it("does not award when the run is legality-invalid", () => {
    const decision = evaluateRerolledBadge(
      { rule: "win_valid_activity", activity_family: "crucible" },
      baseCtx({ legality: makeLegality({ is_valid: false }), activity: activity() })
    );
    expect(decision.awarded).toBe(false);
  });
});

describe("defeat_threshold (crucible_overmatch/high_mark/redline)", () => {
  it("awards at or above the threshold", () => {
    const ctx = baseCtx({
      activity: { family: "crucible", modeKey: null, isWin: null, isCompleted: null, defeats: 30, teamPlacement: null, totalTeams: null, medalKeys: [], isUndefeated: null, isMercy: null, scoreLeadOnTeam: null, objectiveLeadOnTeam: null },
    });
    expect(evaluateRerolledBadge({ rule: "defeat_threshold", activity_family: "crucible", min_defeats: 30 }, ctx).awarded).toBe(true);
    expect(evaluateRerolledBadge({ rule: "defeat_threshold", activity_family: "crucible", min_defeats: 40 }, ctx).awarded).toBe(false);
  });
});

describe("medal_earned (crucible_column_vii etc.)", () => {
  it("awards when the medal key is present", () => {
    const decision = evaluateRerolledBadge(
      { rule: "medal_earned", medal_key: "seventh_column" },
      baseCtx({
        activity: { family: "crucible", modeKey: null, isWin: null, isCompleted: null, defeats: null, teamPlacement: null, totalTeams: null, medalKeys: ["seventh_column"], isUndefeated: null, isMercy: null, scoreLeadOnTeam: null, objectiveLeadOnTeam: null },
      })
    );
    expect(decision.awarded).toBe(true);
  });
});

describe("card_win_count (trials_passage/iii/vii)", () => {
  it("scopes by card id and checks the win threshold", () => {
    const decision = evaluateRerolledBadge(
      { rule: "card_win_count", min_wins_on_card: 3 },
      baseCtx({ card: { cardId: "card-1", winsOnCard: 3, isFlawless: false, isComplete: false } })
    );
    expect(decision).toEqual({ awarded: true, scopeKey: "card-1" });
  });
});

describe("weekly_match_count (iron_banner_banner_writ)", () => {
  it("awards once the weekly match count is reached, scoped to the week", () => {
    const decision = evaluateRerolledBadge(
      { rule: "weekly_match_count", activity_family: "iron_banner", min_matches: 5 },
      baseCtx({
        weeklyMatchCount: 5,
        weekScopeKey: "ib-week-1",
        activity: { family: "iron_banner", modeKey: null, isWin: null, isCompleted: null, defeats: null, teamPlacement: null, totalTeams: null, medalKeys: [], isUndefeated: null, isMercy: null, scoreLeadOnTeam: null, objectiveLeadOnTeam: null },
      })
    );
    expect(decision).toEqual({ awarded: true, scopeKey: "ib-week-1" });
  });
});
