import type { WeaponSlot } from "@/types/bungie";

export type NullableNumber = number | null;

export interface NormalizedPgcrWeapon {
  weaponHash: number;
  kills: number;
  precisionKills: number;
  weaponType?: string;
}

export interface NormalizedPgcrPlayer {
  membershipId: string;
  membershipType: number | null;
  displayName?: string;
  characterIds: string[];
  kills: NullableNumber;
  assists: NullableNumber;
  deaths: NullableNumber;
  precisionKills: NullableNumber;
  superKills: NullableNumber;
  grenadeKills: NullableNumber;
  meleeKills: NullableNumber;
  weapons: NormalizedPgcrWeapon[];
  weaponDataAvailable: boolean;
}

export interface NormalizedPvEPgcr {
  instanceId: string | null;
  activityHash: number | null;
  activityMode: number | null;
  activityModes: number[];
  period: string | null;
  startTime: string | null;
  endTime: string | null;
  durationSeconds: number | null;
  completed: boolean | null;
  players: NormalizedPgcrPlayer[];
  isSupported: boolean;
  unsupportedReason?: string;
  warnings: string[];
}

export interface RolledWeaponExpectation {
  slot?: WeaponSlot;
  weaponHash?: number;
  itemHash?: number;
  itemInstanceId?: string;
  weaponType?: string;
  optional?: boolean;
}

export interface EquipmentSnapshotWeapon {
  slot?: WeaponSlot;
  weaponHash?: number;
  itemHash?: number;
  itemInstanceId?: string;
  weaponType?: string;
}

export interface EquipmentSnapshot {
  capturedAt: string;
  membershipId?: string;
  characterId?: string;
  weapons: EquipmentSnapshotWeapon[];
}

export type ScoreAttackRunState =
  | "created"
  | "loadout_rolled"
  | "applied"
  | "in_activity"
  | "completed_pending_pgcr"
  | "pgcr_fetched"
  | "parsed"
  | "scored"
  | "finalized"
  | "failed"
  | "abandoned"
  | "expired";
