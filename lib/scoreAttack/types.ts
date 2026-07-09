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

export interface NormalizedPvpPgcrPlayer extends NormalizedPgcrPlayer {
  team: number | null;
  standing: number | null;
  isWin: boolean | null;
  score: number | null;
  medalKeys: string[];
  scoreboardValues: Record<string, number>;
  // This player's own per-entry completion flag - NOT the same as the base
  // NormalizedPgcrBase's `completed`, which is a whole-match aggregate
  // requiring every player's entry to show completed (readCompleted() in
  // pgcr.ts) and is unreliable for PvP: a match where an unrelated teammate
  // or opponent quit early would report completed=false for everyone, even
  // players who played the whole match themselves. Use this field for any
  // PvP per-player "did they leave early" check (#296).
  completed: boolean | null;
}

export interface NormalizedPvpPgcrTeam {
  teamId: number | null;
  standing: number | null;
  score: number | null;
  teamName?: string;
}

interface NormalizedPgcrBase<TPlayer> {
  instanceId: string | null;
  activityHash: number | null;
  activityMode: number | null;
  activityModes: number[];
  period: string | null;
  startTime: string | null;
  endTime: string | null;
  durationSeconds: number | null;
  completed: boolean | null;
  players: TPlayer[];
  isSupported: boolean;
  unsupportedReason?: string;
  warnings: string[];
}

export interface NormalizedPvEPgcr extends NormalizedPgcrBase<NormalizedPgcrPlayer> {
  kind: "pve";
}

export interface NormalizedPvpPgcr extends NormalizedPgcrBase<NormalizedPvpPgcrPlayer> {
  kind: "pvp";
  teams: NormalizedPvpPgcrTeam[];
}

export type NormalizedPgcr = NormalizedPvEPgcr | NormalizedPvpPgcr;

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
