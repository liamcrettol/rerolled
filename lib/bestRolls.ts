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

/** Whether a rolled instance's barrel/magazine/perks match the curated ideal roll. Blank recommendation fields are treated as "not required", not "must be empty". */
export function matchesBestRoll(
  best: BestRoll,
  roll: { barrelName?: string; magazineName?: string; perkNames: string[] }
): boolean {
  if (best.barrel && roll.barrelName !== best.barrel) return false;
  if (best.magazine && roll.magazineName !== best.magazine) return false;
  if (best.perk1 && !roll.perkNames.includes(best.perk1)) return false;
  if (best.perk2 && !roll.perkNames.includes(best.perk2)) return false;
  return true;
}
