import type {
  EquipmentSnapshot,
  EquipmentSnapshotWeapon,
  NormalizedPgcrPlayer,
  NormalizedPgcrWeapon,
  RolledWeaponExpectation,
} from "./types";

export type ComplianceStatus = "eligible" | "flagged" | "ineligible" | "unknown";

export interface ComplianceThresholds {
  eligibleWeaponUsageMin: number;
  flaggedWeaponUsageMin: number;
  eligibleOffLoadoutSnapshotMax: number;
  flaggedOffLoadoutSnapshotMax: number;
  weeklyRequiredWeaponUsageMin: number;
}

export interface WeaponUsageComplianceResult {
  status: ComplianceStatus;
  rolledWeaponKills: number;
  totalWeaponKills: number;
  usageRatio: number | null;
  reasons: string[];
}

export interface SnapshotComplianceResult {
  status: ComplianceStatus;
  totalSnapshots: number;
  offLoadoutSnapshots: number;
  offLoadoutRate: number | null;
  reasons: string[];
}

export interface WeeklyWeaponRequirement {
  weaponType?: string;
  weaponHashes?: number[];
  minimumUsageRatio?: number;
}

export interface WeeklyWeaponRequirementResult {
  status: ComplianceStatus;
  requiredKills: number;
  totalWeaponKills: number;
  usageRatio: number | null;
  reasons: string[];
}

export interface RunEligibilityInput {
  player: NormalizedPgcrPlayer | null;
  expectedWeapons: RolledWeaponExpectation[];
  snapshots: EquipmentSnapshot[];
  weeklyRequirement?: WeeklyWeaponRequirement;
  thresholds?: Partial<ComplianceThresholds>;
}

export interface RunEligibilityResult {
  status: ComplianceStatus;
  weaponUsage: WeaponUsageComplianceResult;
  snapshots: SnapshotComplianceResult;
  weeklyRequirement?: WeeklyWeaponRequirementResult;
  reasons: string[];
}

export const DEFAULT_COMPLIANCE_THRESHOLDS: ComplianceThresholds = {
  eligibleWeaponUsageMin: 0.7,
  flaggedWeaponUsageMin: 0.4,
  eligibleOffLoadoutSnapshotMax: 0.2,
  flaggedOffLoadoutSnapshotMax: 0.5,
  weeklyRequiredWeaponUsageMin: 0.7,
};

function mergeThresholds(thresholds?: Partial<ComplianceThresholds>): ComplianceThresholds {
  return { ...DEFAULT_COMPLIANCE_THRESHOLDS, ...thresholds };
}

function expectedHash(expectation: RolledWeaponExpectation): number | null {
  const hash = expectation.weaponHash ?? expectation.itemHash ?? null;
  return hash && hash > 0 ? hash : null;
}

function activeExpectedWeapons(
  expectations: RolledWeaponExpectation[]
): RolledWeaponExpectation[] {
  return expectations.filter((expectation) => {
    if (expectation.optional) return false;
    return Boolean(expectedHash(expectation) || expectation.itemInstanceId);
  });
}

function statusFromWeaponUsage(ratio: number, thresholds: ComplianceThresholds): ComplianceStatus {
  if (ratio >= thresholds.eligibleWeaponUsageMin) return "eligible";
  if (ratio >= thresholds.flaggedWeaponUsageMin) return "flagged";
  return "ineligible";
}

function statusFromSnapshotRate(rate: number, thresholds: ComplianceThresholds): ComplianceStatus {
  if (rate <= thresholds.eligibleOffLoadoutSnapshotMax) return "eligible";
  if (rate <= thresholds.flaggedOffLoadoutSnapshotMax) return "flagged";
  return "ineligible";
}

function weaponMatchesExpectation(
  weapon: EquipmentSnapshotWeapon,
  expectation: RolledWeaponExpectation
): boolean {
  if (expectation.slot && weapon.slot && expectation.slot !== weapon.slot) return false;
  if (expectation.itemInstanceId) return weapon.itemInstanceId === expectation.itemInstanceId;
  const hash = expectedHash(expectation);
  return Boolean(hash && (weapon.weaponHash === hash || weapon.itemHash === hash));
}

function snapshotMatchesExpected(
  snapshot: EquipmentSnapshot,
  expectations: RolledWeaponExpectation[]
): boolean {
  return expectations.every((expectation) =>
    snapshot.weapons.some((weapon) => weaponMatchesExpectation(weapon, expectation))
  );
}

function combineStatuses(statuses: ComplianceStatus[]): ComplianceStatus {
  if (statuses.includes("ineligible")) return "ineligible";
  if (statuses.includes("flagged")) return "flagged";
  if (statuses.includes("unknown")) return "unknown";
  return "eligible";
}

function totalWeaponKills(weapons: NormalizedPgcrWeapon[]): number {
  return weapons.reduce((sum, weapon) => sum + weapon.kills, 0);
}

export function computeWeaponUsageCompliance(input: {
  player: NormalizedPgcrPlayer | null;
  expectedWeapons: RolledWeaponExpectation[];
  thresholds?: Partial<ComplianceThresholds>;
}): WeaponUsageComplianceResult {
  const thresholds = mergeThresholds(input.thresholds);
  const reasons: string[] = [];
  const expectations = activeExpectedWeapons(input.expectedWeapons);
  const expectedHashes = new Set(expectations.map(expectedHash).filter((hash): hash is number => hash !== null));

  if (!input.player) {
    return {
      status: "unknown",
      rolledWeaponKills: 0,
      totalWeaponKills: 0,
      usageRatio: null,
      reasons: ["missing_player_pgcr"],
    };
  }

  if (!expectations.length) {
    return {
      status: "unknown",
      rolledWeaponKills: 0,
      totalWeaponKills: 0,
      usageRatio: null,
      reasons: ["missing_expected_weapons"],
    };
  }

  if (!input.player.weaponDataAvailable) {
    return {
      status: "unknown",
      rolledWeaponKills: 0,
      totalWeaponKills: 0,
      usageRatio: null,
      reasons: ["missing_pgcr_weapon_data"],
    };
  }

  if (!expectedHashes.size) {
    return {
      status: "unknown",
      rolledWeaponKills: 0,
      totalWeaponKills: 0,
      usageRatio: null,
      reasons: ["missing_expected_weapon_hashes"],
    };
  }

  const totalKills = totalWeaponKills(input.player.weapons);
  const rolledWeaponKills = input.player.weapons
    .filter((weapon) => expectedHashes.has(weapon.weaponHash))
    .reduce((sum, weapon) => sum + weapon.kills, 0);

  if (totalKills <= 0) {
    return {
      status: "ineligible",
      rolledWeaponKills,
      totalWeaponKills: totalKills,
      usageRatio: 0,
      reasons: ["no_weapon_kills"],
    };
  }

  const usageRatio = rolledWeaponKills / totalKills;
  const status = statusFromWeaponUsage(usageRatio, thresholds);
  if (status === "flagged") reasons.push("rolled_weapon_usage_flagged");
  if (status === "ineligible") reasons.push("rolled_weapon_usage_too_low");

  return {
    status,
    rolledWeaponKills,
    totalWeaponKills: totalKills,
    usageRatio,
    reasons,
  };
}

export function computeSnapshotCompliance(input: {
  snapshots: EquipmentSnapshot[];
  expectedWeapons: RolledWeaponExpectation[];
  thresholds?: Partial<ComplianceThresholds>;
}): SnapshotComplianceResult {
  const thresholds = mergeThresholds(input.thresholds);
  const expectations = activeExpectedWeapons(input.expectedWeapons);

  if (!expectations.length) {
    return {
      status: "unknown",
      totalSnapshots: input.snapshots.length,
      offLoadoutSnapshots: 0,
      offLoadoutRate: null,
      reasons: ["missing_expected_weapons"],
    };
  }

  if (!input.snapshots.length) {
    return {
      status: "unknown",
      totalSnapshots: 0,
      offLoadoutSnapshots: 0,
      offLoadoutRate: null,
      reasons: ["missing_equipment_snapshots"],
    };
  }

  const offLoadoutSnapshots = input.snapshots.filter(
    (snapshot) => !snapshotMatchesExpected(snapshot, expectations)
  ).length;
  const offLoadoutRate = offLoadoutSnapshots / input.snapshots.length;
  const status = statusFromSnapshotRate(offLoadoutRate, thresholds);
  const reasons: string[] = [];
  if (status === "flagged") reasons.push("off_loadout_snapshot_rate_flagged");
  if (status === "ineligible") reasons.push("off_loadout_snapshot_rate_too_high");

  return {
    status,
    totalSnapshots: input.snapshots.length,
    offLoadoutSnapshots,
    offLoadoutRate,
    reasons,
  };
}

export function computeWeeklyRequirementCompliance(input: {
  player: NormalizedPgcrPlayer | null;
  requirement: WeeklyWeaponRequirement;
  thresholds?: Partial<ComplianceThresholds>;
}): WeeklyWeaponRequirementResult {
  const thresholds = mergeThresholds(input.thresholds);
  const minimumUsageRatio =
    input.requirement.minimumUsageRatio ?? thresholds.weeklyRequiredWeaponUsageMin;

  if (!input.player) {
    return {
      status: "unknown",
      requiredKills: 0,
      totalWeaponKills: 0,
      usageRatio: null,
      reasons: ["missing_player_pgcr"],
    };
  }

  if (!input.player.weaponDataAvailable) {
    return {
      status: "unknown",
      requiredKills: 0,
      totalWeaponKills: 0,
      usageRatio: null,
      reasons: ["missing_pgcr_weapon_data"],
    };
  }

  const requiredHashes = new Set(input.requirement.weaponHashes ?? []);
  const hasTypeRequirement = Boolean(input.requirement.weaponType);
  const matchesRequirement = (weapon: NormalizedPgcrWeapon) => {
    if (requiredHashes.has(weapon.weaponHash)) return true;
    return hasTypeRequirement && weapon.weaponType === input.requirement.weaponType;
  };

  const totalKills = totalWeaponKills(input.player.weapons);
  const requiredKills = input.player.weapons
    .filter(matchesRequirement)
    .reduce((sum, weapon) => sum + weapon.kills, 0);

  if (totalKills <= 0) {
    return {
      status: "ineligible",
      requiredKills,
      totalWeaponKills: totalKills,
      usageRatio: 0,
      reasons: ["no_weapon_kills"],
    };
  }

  if (!requiredHashes.size && hasTypeRequirement && input.player.weapons.every((weapon) => !weapon.weaponType)) {
    return {
      status: "unknown",
      requiredKills,
      totalWeaponKills: totalKills,
      usageRatio: null,
      reasons: ["missing_weapon_type_metadata"],
    };
  }

  const usageRatio = requiredKills / totalKills;
  return {
    status: usageRatio >= minimumUsageRatio ? "eligible" : "ineligible",
    requiredKills,
    totalWeaponKills: totalKills,
    usageRatio,
    reasons: usageRatio >= minimumUsageRatio ? [] : ["weekly_required_weapon_usage_too_low"],
  };
}

export function computeRunEligibility(input: RunEligibilityInput): RunEligibilityResult {
  const weaponUsage = computeWeaponUsageCompliance({
    player: input.player,
    expectedWeapons: input.expectedWeapons,
    thresholds: input.thresholds,
  });
  const snapshots = computeSnapshotCompliance({
    snapshots: input.snapshots,
    expectedWeapons: input.expectedWeapons,
    thresholds: input.thresholds,
  });
  const weeklyRequirement = input.weeklyRequirement
    ? computeWeeklyRequirementCompliance({
        player: input.player,
        requirement: input.weeklyRequirement,
        thresholds: input.thresholds,
      })
    : undefined;

  const status = combineStatuses([
    weaponUsage.status,
    snapshots.status,
    ...(weeklyRequirement ? [weeklyRequirement.status] : []),
  ]);
  const reasons = [
    ...weaponUsage.reasons,
    ...snapshots.reasons,
    ...(weeklyRequirement?.reasons ?? []),
  ];

  return {
    status,
    weaponUsage,
    snapshots,
    weeklyRequirement,
    reasons,
  };
}
