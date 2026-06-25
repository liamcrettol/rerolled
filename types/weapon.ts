export interface ResolvedPerk {
  hash: number;
  name: string;
  description: string;
  icon: string;
  isSelected: boolean;
}

export interface ResolvedWeapon {
  itemHash: number;
  itemInstanceId: string;
  name: string;
  flavorText: string;
  icon: string;
  screenshot?: string;
  slot: "kinetic" | "energy" | "power";
  weaponType: string; // Hand Cannon, Auto Rifle, etc.
  ammoType: string; // Primary, Special, Heavy
  damageType: string; // Kinetic, Arc, Solar, Void, Stasis, Strand
  damageTypeIcon: string;
  intrinsicFrame?: string; // Precision Frame, Aggressive Burst, etc.
  lightLevel: number;
  isEquipped: boolean;
  location: "character" | "vault" | "postmaster";
  characterId?: string; // which character it's on (if not vault)
  barrel?: ResolvedPerk; // socket 1
  magazine?: ResolvedPerk; // socket 2
  masterwork?: ResolvedPerk; // socket 6+
  perks: ResolvedPerk[][]; // columns of perks (each column is an array of options)
  stats: ResolvedStat[];
  tierType: number; // 6=Exotic, 5=Legendary
  tierName: string;
}

export interface ResolvedStat {
  hash: number;
  name: string;
  value: number;
  displayMaximum: number;
}

// A weapon reduced to just its hash for intersection math
export interface WeaponHashEntry {
  itemHash: number;
  itemInstanceId: string;
  location: "character" | "vault" | "postmaster";
  characterId?: string;
  slot: "kinetic" | "energy" | "power";
}

export interface SealStatus {
  isInLoadout: boolean;
  isInYourRoll: boolean;
  isInFireteamRoll: boolean;
}
