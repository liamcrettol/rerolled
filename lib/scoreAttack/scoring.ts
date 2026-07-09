import type { NormalizedPgcr, NormalizedPgcrPlayer, NormalizedPvpPgcr, NormalizedPvpPgcrPlayer } from "./types";

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
  pgcr: NormalizedPgcr;
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

function findPlayer(pgcr: NormalizedPgcr, membershipId: string): NormalizedPgcrPlayer | null {
  return pgcr.players.find((player) => player.membershipId === membershipId) ?? null;
}

function calculateTimeComponents(
  durationSeconds: number | null,
  config: ScoreAttackScoringConfig,
  notes: string[],
): { timeBonus: number; timePenalty: number } {
  if (durationSeconds === null) {
    notes.push("missing_duration");
    return { timeBonus: 0, timePenalty: 0 };
  }

  if (durationSeconds <= config.targetDurationSeconds) {
    return {
      timeBonus: Math.min(
        config.maxTimeBonus,
        Math.round((config.targetDurationSeconds - durationSeconds) * config.timeBonusPerSecondUnderTarget),
      ),
      timePenalty: 0,
    };
  }

  return {
    timeBonus: 0,
    timePenalty: Math.min(
      config.maxTimePenalty,
      Math.round((durationSeconds - config.targetDurationSeconds) * config.timePenaltyPerSecondOverTarget),
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
    0,
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
    notes,
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
      deathPenalty,
  );
  const totalScore = completionSatisfied
    ? Math.max(
        0,
        Math.round(
          subtotalBeforeMultipliers *
            config.difficultyMultiplier *
            rolledWeaponUsageMultiplier,
        ),
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

// ── PvP weekly challenge scoring (#296) ─────────────────────────────────────
// A separate model, not a config variant of scoreAttackRun: PvE's formula is
// built entirely around clear-time and completion, neither of which maps to
// a Crucible match. This scores off win/loss and rolled-weapon performance
// instead, with eligibility gates that keep a win alone from carrying the
// score and reject degenerate matches. Deliberately skips medalKeys/standing
// - pgcr.ts already documents medal-hash lookup isn't wired yet, so it would
// be unreliable data to score against.

export interface PvpScoreAttackScoringConfig {
  winBonus: number;
  rolledWeaponKillPoints: number;
  rolledWeaponPrecisionBonus: number;
  deathPenalty: number;
  /** Anti-cheese: rejects instant-quit/corrupt matches. */
  minMatchDurationSeconds: number;
  /** Anti-cheese: must not leave early. Checked per-player (see NormalizedPvpPgcrPlayer.completed), never the whole-match aggregate. */
  requireCompletion: boolean;
  /** Anti-cheese: a win with zero rolled-weapon contribution can't carry the score. */
  requireRolledWeaponKill: boolean;
  difficultyMultiplier: number;
  maxRolledWeaponUsageBonusMultiplier: number;
}

export interface PvpScoreAttackInput {
  pgcr: NormalizedPvpPgcr;
  playerMembershipId: string;
  rolledWeaponHashes: number[];
  config?: Partial<PvpScoreAttackScoringConfig>;
}

export interface PvpScoreAttackBreakdown {
  playerMembershipId: string;
  completed: boolean | null;
  isWin: boolean | null;
  winBonus: number;
  rolledWeaponKills: number;
  rolledWeaponKillScore: number;
  rolledWeaponPrecisionKills: number;
  rolledWeaponPrecisionBonus: number;
  durationSeconds: number | null;
  deaths: number | null;
  deathPenalty: number;
  subtotalBeforeMultipliers: number;
  difficultyMultiplier: number;
  rolledWeaponUsageRatio: number | null;
  rolledWeaponUsageMultiplier: number;
  totalScore: number;
  notes: string[];
}

export interface PvpScoreAttackResult {
  totalScore: number;
  breakdown: PvpScoreAttackBreakdown;
}

export const DEFAULT_PVP_SCORE_ATTACK_SCORING: PvpScoreAttackScoringConfig = {
  // Tuned conservatively for launch (#296 review) - at 150/rolled-kill, a
  // larger win bonus would let a win with a handful of kills outscore a
  // weapon-focused performance. Retune from real match data in Phase 2.
  winBonus: 600,
  rolledWeaponKillPoints: 150,
  rolledWeaponPrecisionBonus: 40,
  deathPenalty: 40,
  minMatchDurationSeconds: 180,
  requireCompletion: true,
  requireRolledWeaponKill: true,
  difficultyMultiplier: 1,
  maxRolledWeaponUsageBonusMultiplier: 0.25,
};

function mergePvpConfig(config?: Partial<PvpScoreAttackScoringConfig>): PvpScoreAttackScoringConfig {
  return { ...DEFAULT_PVP_SCORE_ATTACK_SCORING, ...config };
}

function findPvpPlayer(pgcr: NormalizedPvpPgcr, membershipId: string): NormalizedPvpPgcrPlayer | null {
  return pgcr.players.find((player) => player.membershipId === membershipId) ?? null;
}

export function pvpScoreAttackRun(input: PvpScoreAttackInput): PvpScoreAttackResult {
  const config = mergePvpConfig(input.config);
  const notes: string[] = [];
  const rolledHashes = new Set(input.rolledWeaponHashes.filter((hash) => hash > 0));
  const player = findPvpPlayer(input.pgcr, input.playerMembershipId);

  if (!player) {
    notes.push("player_not_found");
    const breakdown: PvpScoreAttackBreakdown = {
      playerMembershipId: input.playerMembershipId,
      completed: null,
      isWin: null,
      winBonus: 0,
      rolledWeaponKills: 0,
      rolledWeaponKillScore: 0,
      rolledWeaponPrecisionKills: 0,
      rolledWeaponPrecisionBonus: 0,
      durationSeconds: input.pgcr.durationSeconds,
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

  // Eligibility gates - defense-in-depth on top of what worker/detection.ts
  // already confirms upstream (an exact activity_hash match plus the run
  // owner's own per-character completion via Stats/Activities) before a run
  // ever reaches scoring.
  const completionSatisfied = player.completed === true || !config.requireCompletion;
  if (!completionSatisfied) notes.push("completion_required");

  const durationSeconds = input.pgcr.durationSeconds;
  const durationSatisfied = durationSeconds !== null && durationSeconds >= config.minMatchDurationSeconds;
  if (!durationSatisfied) notes.push("match_too_short");

  const rolledWeapons = player.weapons.filter((weapon) => rolledHashes.has(weapon.weaponHash));
  const rolledWeaponKills = rolledWeapons.reduce((sum, weapon) => sum + weapon.kills, 0);
  const rolledWeaponPrecisionKills = rolledWeapons.reduce(
    (sum, weapon) => sum + weapon.precisionKills,
    0,
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
  const rolledWeaponKillSatisfied = rolledWeaponKills > 0 || !config.requireRolledWeaponKill;
  if (!rolledWeaponKillSatisfied) notes.push("rolled_weapon_kill_required");

  if (player.deaths === null) notes.push("missing_deaths");

  const eligible = completionSatisfied && durationSatisfied && rolledWeaponKillSatisfied;

  const winBonus = player.isWin === true ? config.winBonus : 0;
  const rolledWeaponKillScore = rolledWeaponKills * config.rolledWeaponKillPoints;
  const rolledWeaponPrecisionBonus = rolledWeaponPrecisionKills * config.rolledWeaponPrecisionBonus;
  const deathPenalty = (player.deaths ?? 0) * config.deathPenalty;
  const subtotalBeforeMultipliers = Math.max(
    0,
    winBonus + rolledWeaponKillScore + rolledWeaponPrecisionBonus - deathPenalty,
  );
  const totalScore = eligible
    ? Math.max(
        0,
        Math.round(subtotalBeforeMultipliers * config.difficultyMultiplier * rolledWeaponUsageMultiplier),
      )
    : 0;

  const breakdown: PvpScoreAttackBreakdown = {
    playerMembershipId: input.playerMembershipId,
    completed: player.completed,
    isWin: player.isWin,
    winBonus,
    rolledWeaponKills,
    rolledWeaponKillScore,
    rolledWeaponPrecisionKills,
    rolledWeaponPrecisionBonus,
    durationSeconds,
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
