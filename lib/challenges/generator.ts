import type { ActivityFamily, ScoringConfig, WeeklyChallengeRuleSet } from "@/types/challenges";
import { getActivityPool } from "@/lib/scoreAttack/activityPool";
import {
  activityCompletionRequiredRule,
  allowExoticsRule,
  requiredWeaponTypeRule,
  rerollLimitRule,
  validateRuleSet,
  type RuleValidationContext,
} from "./rules";

// Deterministic weekly challenge draft generator (#256). Given the same
// inputs, always produces the same draft — no Math.random / Date.now / other
// non-deterministic sources anywhere in this module.

export interface ActivityPoolEntry {
  activityHash: number;
  name: string;
  mode: number;
  family: ActivityFamily;
}

export interface WeeklyChallengeDraft {
  seasonKey: string;
  weekNumber: number;
  seed: string;
  title: string;
  slug: string;
  activityHash: number;
  activityNameSnapshot: string;
  activityMode: number;
  activityFamily: ActivityFamily;
  rules: WeeklyChallengeRuleSet;
  scoringConfig: ScoringConfig;
  validationWarnings: string[];
}

export interface GenerateWeeklyChallengeInput {
  seasonKey: string;
  weekNumber: number;
  /** Overrides the derived seed. Same seed + inputs always produce the same draft. */
  seed?: string;
  activityPool?: ActivityPoolEntry[];
  forcedActivity?: ActivityPoolEntry;
  forcedRules?: WeeklyChallengeRuleSet;
  ruleValidationContext?: RuleValidationContext;
}

// Bungie DestinyActivityModeType per catalog kind, majority-verified against
// the live manifest (#273) — not used for validation anywhere yet, only
// stored/displayed, so a per-kind constant is enough (no per-hash lookup).
const PVE_KIND_MODE = { raid: 4, dungeon: 82, grandmaster: 46 } as const;
const PVE_KIND_FAMILY: Record<keyof typeof PVE_KIND_MODE, ActivityFamily> = {
  raid: "raid",
  dungeon: "dungeon",
  grandmaster: "gm",
};

// Real, manifest-sourced pool (#273 — this used to be 3 fake placeholder
// hashes that never matched a real activity, so PGCR detection could never
// succeed for a weekly run). Backed by the same catalog Score Attack uses
// (`data/activities/activity-catalog.json`, built by
// scripts/build-activity-catalog.mjs). Flattened to one pool entry per real
// activity hash so whichever variant the RNG picks is guaranteed matchable.
function buildDefaultActivityPool(): ActivityPoolEntry[] {
  const activities = getActivityPool({
    pillar: "pve",
    kinds: Object.keys(PVE_KIND_MODE) as Array<keyof typeof PVE_KIND_MODE>,
  });

  const pool: ActivityPoolEntry[] = [];
  for (const activity of activities) {
    const kind = activity.kind as keyof typeof PVE_KIND_MODE;
    for (const activityHash of activity.activityHashes) {
      pool.push({ activityHash, name: activity.name, mode: PVE_KIND_MODE[kind], family: PVE_KIND_FAMILY[kind] });
    }
  }

  if (pool.length === 0) {
    throw new Error("Activity catalog has no raid/dungeon/grandmaster entries — regenerate data/activities/activity-catalog.json");
  }

  return pool;
}

const DEFAULT_ACTIVITY_POOL: ActivityPoolEntry[] = buildDefaultActivityPool();

const DEFAULT_WEAPON_TYPE_POOL = ["Hand Cannon", "Sidearm", "Scout Rifle", "Pulse Rifle", "Auto Rifle"];

const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  base_points_per_kill: 10,
  rolled_weapon_multiplier: 2,
  precision_kill_bonus: 5,
  death_penalty: -25,
  flawless_bonus: 500,
  completion_bonus: 1000,
};

// Deterministic string -> uint32 hash (FNV-1a).
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// mulberry32: small, fast, deterministic PRNG from a uint32 seed.
function mulberry32(seed: number) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

export function deriveWeeklyChallengeSeed(seasonKey: string, weekNumber: number, salt?: string): string {
  return salt ?? `${seasonKey}:${weekNumber}`;
}

export function slugifyWeeklyChallenge(seasonKey: string, weekNumber: number): string {
  return `${seasonKey}-week-${weekNumber}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

export function generateWeeklyChallengeDraft(input: GenerateWeeklyChallengeInput): WeeklyChallengeDraft {
  const seed = deriveWeeklyChallengeSeed(input.seasonKey, input.weekNumber, input.seed);
  const rand = mulberry32(fnv1a(seed));

  const pool = input.activityPool && input.activityPool.length > 0 ? input.activityPool : DEFAULT_ACTIVITY_POOL;
  const activity = input.forcedActivity ?? pick(rand, pool);

  const rules =
    input.forcedRules ??
    ([
      requiredWeaponTypeRule(pick(rand, DEFAULT_WEAPON_TYPE_POOL)),
      allowExoticsRule(rand() > 0.5),
      rerollLimitRule(Math.floor(rand() * 4)),
      activityCompletionRequiredRule(true),
    ] satisfies WeeklyChallengeRuleSet);

  const { errors } = validateRuleSet(rules, input.ruleValidationContext);

  const requiredWeaponType = rules.find((r) => r.key === "required_weapon_type");
  const titleSubject = typeof requiredWeaponType?.value === "string" ? `${requiredWeaponType.value} Supremacy` : "Challenge";

  return {
    seasonKey: input.seasonKey,
    weekNumber: input.weekNumber,
    seed,
    title: `Week ${input.weekNumber}: ${titleSubject}`,
    slug: slugifyWeeklyChallenge(input.seasonKey, input.weekNumber),
    activityHash: activity.activityHash,
    activityNameSnapshot: activity.name,
    activityMode: activity.mode,
    activityFamily: activity.family,
    rules,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    validationWarnings: errors,
  };
}
