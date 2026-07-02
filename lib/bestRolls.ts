// Community-curated "ideal roll" per weapon archetype, imported from the
// group's spreadsheet (see data/best-rolls/README.md). Currently a
// provisional/unverified v1 baseline - not yet the multi-person reviewed
// data the workflow describes - so treat matches as a starting point, not
// gospel.

import bestRollsRaw from "@/data/best-rolls/best-rolls.json";

export interface BestRoll {
  weaponType: string;
  frame: string;
  exampleWeapons: string | null;
  barrel: string | null;
  magazine: string | null;
  perk1: string | null;
  perk2: string | null;
  priorityMasterwork: string | null;
  priorityStat1: string | null;
  priorityStat2: string | null;
  notes: string | null;
}

const BEST_ROLLS = bestRollsRaw as unknown as Record<string, BestRoll>;

/** Look up the curated ideal roll for a weapon type + intrinsic frame name (e.g. "Auto Rifle", "Precision Frame"). */
export function getBestRoll(weaponType: string, frame: string | undefined): BestRoll | null {
  if (!weaponType || !frame) return null;
  return BEST_ROLLS[`${weaponType}|${frame}`] ?? null;
}

export interface BestRollScore {
  matched: number;
  total: number;
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/\benhanced\b/g, "")
    .replace(/\bmasterwork\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function namesMatch(actual: string | undefined, expected: string | null): boolean {
  if (!expected) return false;
  return normalizeName(actual) === normalizeName(expected);
}

/** Score a rolled instance against the curated ideal roll. Blank recommendation fields are treated as "not required", not "must be empty". */
export function scoreBestRoll(
  best: BestRoll,
  roll: { barrelName?: string; magazineName?: string; perkNames: string[]; masterworkName?: string }
): BestRollScore {
  let matched = 0;
  let total = 0;

  const scoreField = (expected: string | null, actualMatches: boolean) => {
    if (!expected) return;
    total += 1;
    if (actualMatches) matched += 1;
  };

  scoreField(best.barrel, namesMatch(roll.barrelName, best.barrel));
  scoreField(best.magazine, namesMatch(roll.magazineName, best.magazine));
  scoreField(best.perk1, roll.perkNames.some((name) => namesMatch(name, best.perk1)));
  scoreField(best.perk2, roll.perkNames.some((name) => namesMatch(name, best.perk2)));
  scoreField(best.priorityMasterwork, namesMatch(roll.masterworkName, best.priorityMasterwork));

  return { matched, total };
}

/** Whether a rolled instance matches every populated field in the curated ideal roll. */
export function matchesBestRoll(
  best: BestRoll,
  roll: { barrelName?: string; magazineName?: string; perkNames: string[]; masterworkName?: string }
): boolean {
  const score = scoreBestRoll(best, roll);
  return score.total > 0 && score.matched === score.total;
}
