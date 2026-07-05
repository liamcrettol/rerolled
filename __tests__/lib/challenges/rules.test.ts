import {
  allowExoticsRule,
  bannedWeaponTypeRule,
  requiredExoticSlotRule,
  requiredWeaponTypeRule,
  rerollLimitRule,
  minimumRolledWeaponUsagePctRule,
  validateRuleSet,
} from "@/lib/challenges/rules";

describe("validateRuleSet", () => {
  it("accepts a consistent rule set", () => {
    const result = validateRuleSet([requiredWeaponTypeRule("Sidearm"), allowExoticsRule(false), rerollLimitRule(3)]);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects required and banned weapon type being the same", () => {
    const result = validateRuleSet([requiredWeaponTypeRule("Sidearm"), bannedWeaponTypeRule("Sidearm")]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/required_weapon_type and banned_weapon_type/);
  });

  it("rejects allow_exotics=false with a required exotic slot", () => {
    const result = validateRuleSet([allowExoticsRule(false), requiredExoticSlotRule("heavy")]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/allow_exotics is false/);
  });

  it("rejects a negative reroll limit", () => {
    const result = validateRuleSet([rerollLimitRule(-1)]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/reroll_limit must not be negative/);
  });

  it("rejects an out-of-range minimum rolled weapon usage percentage", () => {
    const result = validateRuleSet([minimumRolledWeaponUsagePctRule(150)]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/minimum_rolled_weapon_usage_pct must be between 0 and 100/);
  });

  it("rejects an unknown weapon type when a known-types context is supplied", () => {
    const result = validateRuleSet([requiredWeaponTypeRule("Nonexistent Gun")], {
      knownWeaponTypes: new Set(["Sidearm", "Hand Cannon"]),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/unknown weapon type/);
  });

  it("collects multiple errors at once", () => {
    const result = validateRuleSet([
      requiredWeaponTypeRule("Sidearm"),
      bannedWeaponTypeRule("Sidearm"),
      rerollLimitRule(-5),
    ]);
    expect(result.errors).toHaveLength(2);
  });
});
