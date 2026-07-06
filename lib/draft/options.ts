// Draft mode v2 (#266): a shared fireteam loadout filled in by the captain
// choosing 1-of-3 candidate weapons per slot, Clash Royale card-reveal style —
// instead of #264's (wrong) per-player pick-for-teammate model. Pure
// selection/validation logic lives here; lib/draft/optionsService.ts persists
// it into the same lobby_rounds/lobby_loadout_slots tables roulette rounds use.

export const CANDIDATES_PER_SLOT = 3;

/**
 * Deterministic given `rng`: samples up to `count` distinct hashes from
 * `pool` without replacement. Returns fewer than `count` if the pool is
 * smaller (a slot with only 1-2 owned weapons still gets a valid, if short,
 * reveal instead of erroring).
 */
export function pickCandidates(
  pool: number[],
  count: number = CANDIDATES_PER_SLOT,
  rng: () => number = Math.random
): number[] {
  const unique = [...new Set(pool)];
  const picked: number[] = [];
  const remaining = [...unique];
  while (picked.length < count && remaining.length > 0) {
    const i = Math.floor(rng() * remaining.length);
    picked.push(remaining[i]);
    remaining.splice(i, 1);
  }
  return picked;
}

export function isValidPick(options: number[], itemHash: number): boolean {
  return options.includes(itemHash);
}
