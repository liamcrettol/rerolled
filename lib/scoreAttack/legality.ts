import type { NormalizedPgcrPlayer, RolledWeaponExpectation } from "./types";

export interface RunLegalityEvaluation {
  isValid: boolean;
  hadActiveLoadout: boolean;
  rolledFinalBlows: number;
  illegalFinalBlows: number;
  illegalSources: string[];
  rolledWeaponsUsed: number[];
}

function expectedHash(expectation: RolledWeaponExpectation): number | null {
  const hash = expectation.weaponHash ?? expectation.itemHash ?? null;
  return hash && hash > 0 ? hash : null;
}

function activeExpectedHashes(expectations: RolledWeaponExpectation[]): number[] {
  return expectations
    .filter((expectation) => !expectation.optional)
    .map(expectedHash)
    .filter((hash): hash is number => hash !== null);
}

export function computeRunLegality(input: {
  player: NormalizedPgcrPlayer | null;
  expectedWeapons: RolledWeaponExpectation[];
}): RunLegalityEvaluation {
  const expectedHashes = activeExpectedHashes(input.expectedWeapons);
  const expectedSet = new Set(expectedHashes);
  const hadActiveLoadout = expectedHashes.length > 0;

  if (!input.player) {
    return {
      isValid: false,
      hadActiveLoadout,
      rolledFinalBlows: 0,
      illegalFinalBlows: 0,
      illegalSources: ["missing_player_pgcr"],
      rolledWeaponsUsed: [],
    };
  }

  const abilitySources: Array<[string, number | null]> = [
    ["melee", input.player.meleeKills],
    ["grenade", input.player.grenadeKills],
    ["super", input.player.superKills],
  ];
  const illegalSources = abilitySources
    .filter(([, kills]) => (kills ?? 0) > 0)
    .map(([source]) => source);

  const rolledWeaponsUsed = input.player.weapons
    .filter((weapon) => weapon.kills > 0 && expectedSet.has(weapon.weaponHash))
    .map((weapon) => weapon.weaponHash)
    .sort((a, b) => a - b);

  const rolledFinalBlows = input.player.weapons
    .filter((weapon) => expectedSet.has(weapon.weaponHash))
    .reduce((sum, weapon) => sum + weapon.kills, 0);

  const offRollWeapons = input.player.weapons
    .filter((weapon) => weapon.kills > 0 && !expectedSet.has(weapon.weaponHash))
    .sort((a, b) => a.weaponHash - b.weaponHash);
  for (const weapon of offRollWeapons) {
    illegalSources.push(`off_roll_weapon:${weapon.weaponHash}`);
  }

  const illegalFinalBlows =
    (input.player.superKills ?? 0) +
    (input.player.grenadeKills ?? 0) +
    (input.player.meleeKills ?? 0) +
    offRollWeapons.reduce((sum, weapon) => sum + weapon.kills, 0);

  return {
    isValid: hadActiveLoadout && illegalFinalBlows === 0,
    hadActiveLoadout,
    rolledFinalBlows,
    illegalFinalBlows,
    illegalSources,
    rolledWeaponsUsed,
  };
}
