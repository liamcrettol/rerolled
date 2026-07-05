import type { ScoringConfig, WeeklyChallengeRuleSet } from "@/types/challenges";
import { validateRuleSet, type RuleValidationContext } from "./rules";

export interface PublishableChallengeInput {
  slug: string;
  activityHash: number | null;
  startsAt: string | Date;
  endsAt: string | Date;
  rules: WeeklyChallengeRuleSet;
  scoringConfig: ScoringConfig | null;
}

export interface ExistingActiveWindow {
  slug: string;
  startsAt: string | Date;
  endsAt: string | Date;
}

export interface PublishValidationResult {
  valid: boolean;
  errors: string[];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Full pre-publish validation for a weekly challenge draft (#256). Checks
 * rule consistency plus the challenge-level requirements (time window,
 * activity, scoring config, no overlapping active window). Pass the
 * currently-active challenges' windows in `existingActiveWindows` — this
 * function is pure and doesn't query the database itself.
 */
export function validatePublishableChallenge(
  input: PublishableChallengeInput,
  options: { existingActiveWindows?: ExistingActiveWindow[]; ruleValidationContext?: RuleValidationContext } = {}
): PublishValidationResult {
  const errors: string[] = [];

  const startsAt = new Date(input.startsAt).getTime();
  const endsAt = new Date(input.endsAt).getTime();

  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
    errors.push("starts_at/ends_at must be valid dates");
  } else if (startsAt >= endsAt) {
    errors.push("challenge ends before (or at the same time as) it starts");
  }

  if (input.activityHash == null) {
    errors.push("activity_hash is required to publish");
  }

  if (!input.scoringConfig) {
    errors.push("scoring_config is required to publish");
  }

  if (!input.rules || input.rules.length === 0) {
    errors.push("at least one rule is required to publish");
  } else {
    const ruleResult = validateRuleSet(input.rules, options.ruleValidationContext);
    errors.push(...ruleResult.errors);
  }

  if (!Number.isNaN(startsAt) && !Number.isNaN(endsAt) && options.existingActiveWindows) {
    for (const existing of options.existingActiveWindows) {
      if (existing.slug === input.slug) continue;
      const existingStart = new Date(existing.startsAt).getTime();
      const existingEnd = new Date(existing.endsAt).getTime();
      if (overlaps(startsAt, endsAt, existingStart, existingEnd)) {
        errors.push(`overlaps with already-active challenge "${existing.slug}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
