export interface DestinyCharacter {
  characterId: string;
  membershipType: number;
  membershipId: string;
  classType: number; // 0=Titan, 1=Hunter, 2=Warlock
  raceType: number;
  genderType: number;
  light: number;
  emblemBackgroundPath: string;
  emblemPath: string;
  dateLastPlayed: string;
}

export interface DestinyItemComponent {
  itemHash: number;
  itemInstanceId: string;
  quantity: number;
  bindStatus: number;
  location: number; // 1=Inventory, 2=Vault, 3=Vendor, 4=Postmaster
  bucketHash: number;
  transferStatus: number;
  lockable: boolean;
  state: number;
}

export interface DestinyItemInstance {
  damageType: number;
  damageTypeHash?: number;
  primaryStat?: { statHash: number; value: number };
  itemLevel: number;
  quality: number;
  isEquipped: boolean;
  canEquip: boolean;
  equipRequiredLevel: number;
  cannotEquipReason: number;
  energy?: { energyTypeHash: number; energyCapacity: number; energyUsed: number };
}

export interface DestinySocket {
  plugHash?: number;
  isEnabled: boolean;
  isVisible: boolean;
  enableFailIndexes?: number[];
}

export interface DestinyObjectiveProgress {
  objectiveHash: number;
  progress: number;
  completionValue: number;
  complete: boolean;
  visible: boolean;
}

export interface BungieProfileResponse {
  characters: {
    data: Record<string, DestinyCharacter>;
  };
  characterInventories: {
    data: Record<string, { items: DestinyItemComponent[] }>;
  };
  characterEquipment: {
    data: Record<string, { items: DestinyItemComponent[] }>;
  };
  profileInventory: {
    data: { items: DestinyItemComponent[] };
  };
  itemComponents: {
    instances?: { data: Record<string, DestinyItemInstance> };
    objectives?: { data: Record<string, { objectives: DestinyObjectiveProgress[] }> };
    sockets?: { data: Record<string, { sockets: DestinySocket[] }> };
    reusablePlugs?: { data: Record<string, { plugs: Record<string, Array<{ plugItemHash: number; canInsert: boolean; enabled: boolean }>> }> };
  };
}

// Bucket hashes for weapon slots
const WEAPON_BUCKET_HASHES = {
  KINETIC: 1498876634,
  ENERGY: 2465295065,
  POWER: 953998645,
} as const;

export const ALL_WEAPON_BUCKETS = new Set([
  WEAPON_BUCKET_HASHES.KINETIC,
  WEAPON_BUCKET_HASHES.ENERGY,
  WEAPON_BUCKET_HASHES.POWER,
]);

export type WeaponSlot = "kinetic" | "energy" | "power";

export function bucketToSlot(bucketHash: number): WeaponSlot | null {
  if (bucketHash === WEAPON_BUCKET_HASHES.KINETIC) return "kinetic";
  if (bucketHash === WEAPON_BUCKET_HASHES.ENERGY) return "energy";
  if (bucketHash === WEAPON_BUCKET_HASHES.POWER) return "power";
  return null;
}
