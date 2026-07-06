import type { WeeklyChallengeRule, WeeklyChallengeRuleKey, WeeklyChallengeRuleSet } from "@/types/challenges";
import type { WeeklyWeaponRequirement } from "@/lib/scoreAttack/compliance";

// Builders for each supported rule. Each produces the JSONB shape stored in
// weekly_challenges.rules / weekly_challenge_versions.rules.

export function requiredWeaponTypeRule(weaponType: string): WeeklyChallengeRule<"required_weapon_type"> {
  return {
    key: "required_weapon_type",
    value: weaponType,
    chip: `${weaponType} required`,
    display: `At least one rolled weapon must be a ${weaponType}`,
  };
}

export function bannedWeaponTypeRule(weaponType: string): WeeklyChallengeRule<"banned_weapon_type"> {
  return {
    key: "banned_weapon_type",
    value: weaponType,
    chip: `No ${weaponType}s`,
    display: `${weaponType} may not appear in the rolled loadout`,
  };
}

export function requiredDamageTypeRule(damageType: string): WeeklyChallengeRule<"required_damage_type"> {
  return {
    key: "required_damage_type",
    value: damageType,
    chip: `${damageType} required`,
    display: `At least one rolled weapon must deal ${damageType} damage`,
  };
}

export function bannedDamageTypeRule(damageType: string): WeeklyChallengeRule<"banned_damage_type"> {
  return {
    key: "banned_damage_type",
    value: damageType,
    chip: `No ${damageType}`,
    display: `${damageType} damage may not appear in the rolled loadout`,
  };
}

export function allowExoticsRule(allow: boolean): WeeklyChallengeRule<"allow_exotics"> {
  return {
    key: "allow_exotics",
    value: allow,
    chip: allow ? "Exotics allowed" : "No exotics",
    display: allow ? "Exotic weapons may be rolled" : "Exotic weapons are excluded from the roll pool",
  };
}

export function requiredExoticSlotRule(slot: string): WeeklyChallengeRule<"required_exotic_slot"> {
  return {
    key: "required_exotic_slot",
    value: slot,
    chip: `Exotic ${slot}`,
    display: `The ${slot} slot must roll an exotic`,
  };
}

export function rerollLimitRule(limit: number): WeeklyChallengeRule<"reroll_limit"> {
  return {
    key: "reroll_limit",
    value: limit,
    chip: limit === 0 ? "No rerolls" : `${limit} reroll${limit === 1 ? "" : "s"}`,
    display: limit === 0 ? "No rerolls allowed" : `Up to ${limit} rerolls allowed`,
  };
}

export function wildcardSlotsRule(slots: string[]): WeeklyChallengeRule<"wildcard_slots"> {
  return {
    key: "wildcard_slots",
    value: slots,
    chip: `Wildcard: ${slots.join(", ")}`,
    display: `${slots.join(", ")} may be your own equipped weapon instead of a roll`,
  };
}

export function slotLockingRule(enabled: boolean): WeeklyChallengeRule<"slot_locking"> {
  return {
    key: "slot_locking",
    value: enabled,
    chip: enabled ? "Slot locking on" : "Slot locking off",
    display: enabled ? "Individual slots can be locked between rerolls" : "Rerolls replace the entire loadout",
  };
}

export function minimumRolledWeaponUsagePctRule(pct: number): WeeklyChallengeRule<"minimum_rolled_weapon_usage_pct"> {
  return {
    key: "minimum_rolled_weapon_usage_pct",
    value: pct,
    chip: `${pct}% rolled usage`,
    display: `At least ${pct}% of weapon kills must come from the rolled loadout`,
  };
}

export function activityCompletionRequiredRule(required: boolean): WeeklyChallengeRule<"activity_completion_required"> {
  return {
    key: "activity_completion_required",
    value: required,
    chip: required ? "Full clear required" : "Partial clear OK",
    display: required ? "The activity must be completed to count" : "The run counts even if the activity isn't completed",
  };
}

export function freshRequiredRule(required: boolean): WeeklyChallengeRule<"fresh_required"> {
  return {
    key: "fresh_required",
    value: required,
    chip: required ? "Fresh only" : "Checkpoints OK",
    display: required ? "Must start from the beginning of the activity" : "Checkpoint starts are allowed",
  };
}

export function flawlessBonusEnabledRule(enabled: boolean): WeeklyChallengeRule<"flawless_bonus_enabled"> {
  return {
    key: "flawless_bonus_enabled",
    value: enabled,
    chip: "Flawless bonus",
    display: "A zero-death clear earns bonus score",
  };
}

export function findRule<K extends WeeklyChallengeRuleKey>(
  rules: WeeklyChallengeRuleSet,
  key: K
): WeeklyChallengeRule<K> | undefined {
  return rules.find((r): r is WeeklyChallengeRule<K> => r.key === key);
}

/**
 * Translate a published rule set's `required_weapon_type` (+ optional
 * `minimum_rolled_weapon_usage_pct`) into the shape compliance scoring wants.
 * Returns undefined when the week doesn't require a specific weapon type, so
 * callers can skip weekly compliance entirely rather than construct a
 * requirement that matches nothing (#275).
 */
export function weeklyWeaponRequirementFromRules(
  rules: WeeklyChallengeRuleSet | null | undefined
): WeeklyWeaponRequirement | undefined {
  if (!rules) return undefined;
  const requiredWeaponType = findRule(rules, "required_weapon_type");
  if (!requiredWeaponType || typeof requiredWeaponType.value !== "string") return undefined;

  const minUsagePct = findRule(rules, "minimum_rolled_weapon_usage_pct");
  return {
    weaponType: requiredWeaponType.value,
    minimumUsageRatio:
      typeof minUsagePct?.value === "number" ? minUsagePct.value / 100 : undefined,
  };
}

export interface RuleValidationContext {
  /** Weapon type strings known to the manifest-derived weapon pool (lib/bungie/definitions.ts). */
  knownWeaponTypes?: Set<string>;
  /** Damage type strings known to the manifest. */
  knownDamageTypes?: Set<string>;
}

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates that a rule set is internally consistent. This is the single
 * source of truth for "is this weekly challenge rule combination sane" —
 * used by both the generator (to reject bad seeds) and the publish path.
 */
export function validateRuleSet(rules: WeeklyChallengeRuleSet, ctx: RuleValidationContext = {}): RuleValidationResult {
  const errors: string[] = [];

  const requiredWeaponType = findRule(rules, "required_weapon_type");
  const bannedWeaponType = findRule(rules, "banned_weapon_type");
  const requiredDamageType = findRule(rules, "required_damage_type");
  const bannedDamageType = findRule(rules, "banned_damage_type");
  const allowExotics = findRule(rules, "allow_exotics");
  const requiredExoticSlot = findRule(rules, "required_exotic_slot");
  const rerollLimit = findRule(rules, "reroll_limit");
  const minUsagePct = findRule(rules, "minimum_rolled_weapon_usage_pct");

  if (requiredWeaponType && bannedWeaponType && requiredWeaponType.value === bannedWeaponType.value) {
    errors.push(`required_weapon_type and banned_weapon_type are both "${requiredWeaponType.value}"`);
  }

  if (requiredDamageType && bannedDamageType && requiredDamageType.value === bannedDamageType.value) {
    errors.push(`required_damage_type and banned_damage_type are both "${requiredDamageType.value}"`);
  }

  if (allowExotics && allowExotics.value === false && requiredExoticSlot) {
    errors.push("allow_exotics is false but required_exotic_slot is set");
  }

  if (rerollLimit && typeof rerollLimit.value === "number" && rerollLimit.value < 0) {
    errors.push("reroll_limit must not be negative");
  }

  if (minUsagePct && typeof minUsagePct.value === "number" && (minUsagePct.value < 0 || minUsagePct.value > 100)) {
    errors.push("minimum_rolled_weapon_usage_pct must be between 0 and 100");
  }

  if (ctx.knownWeaponTypes) {
    for (const rule of [requiredWeaponType, bannedWeaponType]) {
      if (rule && typeof rule.value === "string" && !ctx.knownWeaponTypes.has(rule.value)) {
        errors.push(`${rule.key} references unknown weapon type "${rule.value}"`);
      }
    }
  }

  if (ctx.knownDamageTypes) {
    for (const rule of [requiredDamageType, bannedDamageType]) {
      if (rule && typeof rule.value === "string" && !ctx.knownDamageTypes.has(rule.value)) {
        errors.push(`${rule.key} references unknown damage type "${rule.value}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
