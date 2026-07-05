import { validatePublishableChallenge } from "@/lib/challenges/validate";
import { requiredWeaponTypeRule } from "@/lib/challenges/rules";
import type { ScoringConfig } from "@/types/challenges";

const scoringConfig: ScoringConfig = {
  base_points_per_kill: 10,
  rolled_weapon_multiplier: 2,
  precision_kill_bonus: 5,
  death_penalty: -25,
  flawless_bonus: 500,
  completion_bonus: 1000,
};

const validInput = {
  slug: "season-0-week-1",
  activityHash: 123,
  startsAt: "2026-01-01T17:00:00Z",
  endsAt: "2026-01-08T17:00:00Z",
  rules: [requiredWeaponTypeRule("Sidearm")],
  scoringConfig,
};

describe("validatePublishableChallenge", () => {
  it("passes a fully-specified, non-overlapping challenge", () => {
    const result = validatePublishableChallenge(validInput);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects a challenge that ends before it starts", () => {
    const result = validatePublishableChallenge({
      ...validInput,
      startsAt: "2026-01-08T17:00:00Z",
      endsAt: "2026-01-01T17:00:00Z",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("challenge ends before (or at the same time as) it starts");
  });

  it("rejects a missing activity hash", () => {
    const result = validatePublishableChallenge({ ...validInput, activityHash: null });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("activity_hash is required to publish");
  });

  it("rejects a missing scoring config", () => {
    const result = validatePublishableChallenge({ ...validInput, scoringConfig: null });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("scoring_config is required to publish");
  });

  it("rejects an empty rule set", () => {
    const result = validatePublishableChallenge({ ...validInput, rules: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("at least one rule is required to publish");
  });

  it("surfaces rule-level inconsistencies alongside challenge-level ones", () => {
    const result = validatePublishableChallenge({
      ...validInput,
      rules: [requiredWeaponTypeRule("Sidearm"), requiredWeaponTypeRule("Sidearm")].map((r, i) =>
        i === 0 ? r : { ...r, key: "banned_weapon_type" as const }
      ),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("required_weapon_type and banned_weapon_type"))).toBe(true);
  });

  it("rejects a window that overlaps an already-active challenge", () => {
    const result = validatePublishableChallenge(validInput, {
      existingActiveWindows: [
        { slug: "season-0-week-0", startsAt: "2025-12-29T17:00:00Z", endsAt: "2026-01-05T17:00:00Z" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("overlaps"))).toBe(true);
  });

  it("allows a back-to-back window that does not overlap (touching boundary)", () => {
    const result = validatePublishableChallenge(validInput, {
      existingActiveWindows: [
        { slug: "season-0-week-0", startsAt: "2025-12-25T17:00:00Z", endsAt: "2026-01-01T17:00:00Z" },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("ignores the challenge's own existing window when checking overlap", () => {
    const result = validatePublishableChallenge(validInput, {
      existingActiveWindows: [{ slug: validInput.slug, startsAt: validInput.startsAt, endsAt: validInput.endsAt }],
    });
    expect(result.valid).toBe(true);
  });
});
