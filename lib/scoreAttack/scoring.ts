import type { NormalizedPgcrPlayer, NormalizedPvEPgcr } from "./types";

export interface ScoreAttackScoringConfig {
  completionScore: number;
  rolledWeaponKillPoints: number;
  rolledWeaponPrecisionBonus: number;
  targetDurationSeconds: number;
  timeBonusPerSecondUnderTarget: number;
  timePenaltyPerSecondOverTarget: number;
  maxTimeBonus: number;
  maxTimePenalty: number;
  deathPenalty: number;
  difficultyMultiplier: number;
  maxRolledWeaponUsageBonusMultiplier: number;
  requireCompletion: boolean;
}

export interface ScoreAttackInput {
  pgcr: NormalizedPvEPgcr;
  playerMembershipId: string;
  rolledWeaponHashes: number[];
  config?: Partial<ScoreAttackScoringConfig>;
}

export interface ScoreAttackBreakdown {
  playerMembershipId: string;
  completed: boolean | null;
  baseCompletionScore: number;
  rolledWeaponKills: number;
  rolledWeaponKillScore: number;
  rolledWeaponPrecisionKills: number;
  rolledWeaponPrecisionBonus: number;
  durationSeconds: number | null;
  timeBonus: number;
  timePenalty: number;
  deaths: number | null;
  deathPenalty: number;
  subtotalBeforeMultipliers: number;
  difficultyMultiplier: number;
  rolledWeaponUsageRatio: number | null;
  rolledWeaponUsageMultiplier: number;
  totalScore: number;
  notes: string[];
}

export interface ScoreAttackResult {
  totalScore: number;
  breakdown: ScoreAttackBreakdown;
}

export const DEFAULT_SCORE_ATTACK_SCORING: ScoreAttackScoringConfig = {
  completionScore: 10_000,
  rolledWeaponKillPoints: 125,
  rolledWeaponPrecisionBonus: 35,
  targetDurationSeconds: 900,
  timeBonusPerSecondUnderTarget: 5,
  timePenaltyPerSecondOverTarget: 2,
  maxTimeBonus: 3_000,
  maxTimePenalty: 2_500,
  deathPenalty: 250,
  difficultyMultiplier: 1,
  maxRolledWeaponUsageBonusMultiplier: 0.25,
  requireCompletion: true,
};

function mergeConfig(config?: Partial<ScoreAttackScoringConfig>): ScoreAttackScoringConfig {
  return { ...DEFAULT_SCORE_ATTACK_SCORING, ...config };
}

function findPlayer(pgcr: NormalizedPvEPgcr, membershipId: string): NormalizedPgcrPlayer | null {
  return pgcr.players.find((player) => player.membershipId === membershipId) ?? null;
}

function calculateTimeComponents(
  durationSeconds: number | null,
  config: ScoreAttackScoringConfig,
  notes: string[]
): { timeBonus: number; timePenalty: number } {
  if (durationSeconds === null) {
    notes.push("missing_duration");
    return { timeBonus: 0, timePenalty: 0 };
  }

  if (durationSeconds <= config.targetDurationSeconds) {
    return {
      timeBonus: Math.min(
        config.maxTimeBonus,
        Math.round((config.targetDurationSeconds - durationSeconds) * config.timeBonusPerSecondUnderTarget)
      ),
      timePenalty: 0,
    };
  }

  return {
    timeBonus: 0,
    timePenalty: Math.min(
      config.maxTimePenalty,
      Math.round((durationSeconds - config.targetDurationSeconds) * config.timePenaltyPerSecondOverTarget)
    ),
  };
}

export function scoreAttackRun(input: ScoreAttackInput): ScoreAttackResult {
  const config = mergeConfig(input.config);
  const notes: string[] = [];
  const rolledHashes = new Set(input.rolledWeaponHashes.filter((hash) => hash > 0));
  const player = findPlayer(input.pgcr, input.playerMembershipId);

  if (!player) {
    notes.push("player_not_found");
    const breakdown: ScoreAttackBreakdown = {
      playerMembershipId: input.playerMembershipId,
      completed: input.pgcr.completed,
      baseCompletionScore: 0,
      rolledWeaponKills: 0,
      rolledWeaponKillScore: 0,
      rolledWeaponPrecisionKills: 0,
      rolledWeaponPrecisionBonus: 0,
      durationSeconds: input.pgcr.durationSeconds,
      timeBonus: 0,
      timePenalty: 0,
      deaths: null,
      deathPenalty: 0,
      subtotalBeforeMultipliers: 0,
      difficultyMultiplier: config.difficultyMultiplier,
      rolledWeaponUsageRatio: null,
      rolledWeaponUsageMultiplier: 1,
      totalScore: 0,
      notes,
    };
    return { totalScore: 0, breakdown };
  }

  const completionSatisfied = input.pgcr.completed === true || !config.requireCompletion;
  if (!completionSatisfied) notes.push("completion_required");

  const rolledWeapons = player.weapons.filter((weapon) => rolledHashes.has(weapon.weaponHash));
  const rolledWeaponKills = rolledWeapons.reduce((sum, weapon) => sum + weapon.kills, 0);
  const rolledWeaponPrecisionKills = rolledWeapons.reduce(
    (sum, weapon) => sum + weapon.precisionKills,
    0
  );
  const totalWeaponKills = player.weapons.reduce((sum, weapon) => sum + weapon.kills, 0);

  let rolledWeaponUsageRatio: number | null = null;
  let rolledWeaponUsageMultiplier = 1;
  if (!player.weaponDataAvailable) {
    notes.push("missing_weapon_data");
  } else if (totalWeaponKills <= 0) {
    notes.push("no_weapon_kills");
  } else {
    rolledWeaponUsageRatio = rolledWeaponKills / totalWeaponKills;
    rolledWeaponUsageMultiplier =
      1 + Math.min(config.maxRolledWeaponUsageBonusMultiplier, rolledWeaponUsageRatio * config.maxRolledWeaponUsageBonusMultiplier);
  }

  if (rolledWeaponKills === 0) notes.push("zero_rolled_weapon_kills");
  if (player.deaths === null) notes.push("missing_deaths");

  const { timeBonus, timePenalty } = calculateTimeComponents(
    input.pgcr.durationSeconds,
    config,
    notes
  );
  const baseCompletionScore = completionSatisfied ? config.completionScore : 0;
  const rolledWeaponKillScore = rolledWeaponKills * config.rolledWeaponKillPoints;
  const rolledWeaponPrecisionBonus = rolledWeaponPrecisionKills * config.rolledWeaponPrecisionBonus;
  const deathPenalty = (player.deaths ?? 0) * config.deathPenalty;
  const subtotalBeforeMultipliers = Math.max(
    0,
    baseCompletionScore +
      rolledWeaponKillScore +
      rolledWeaponPrecisionBonus +
      timeBonus -
      timePenalty -
      deathPenalty
  );
  const totalScore = completionSatisfied
    ? Math.max(
        0,
        Math.round(
          subtotalBeforeMultipliers *
            config.difficultyMultiplier *
            rolledWeaponUsageMultiplier
        )
      )
    : 0;

  const breakdown: ScoreAttackBreakdown = {
    playerMembershipId: input.playerMembershipId,
    completed: input.pgcr.completed,
    baseCompletionScore,
    rolledWeaponKills,
    rolledWeaponKillScore,
    rolledWeaponPrecisionKills,
    rolledWeaponPrecisionBonus,
    durationSeconds: input.pgcr.durationSeconds,
    timeBonus,
    timePenalty,
    deaths: player.deaths,
    deathPenalty,
    subtotalBeforeMultipliers,
    difficultyMultiplier: config.difficultyMultiplier,
    rolledWeaponUsageRatio,
    rolledWeaponUsageMultiplier,
    totalScore,
    notes,
  };

  return { totalScore, breakdown };
}
