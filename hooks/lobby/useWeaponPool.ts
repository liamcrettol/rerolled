"use client";

import { useCallback, useMemo, useState } from "react";
import type { WeaponSlot } from "@/types/bungie";

// The shared weapon pool (#224): everything the intersection endpoint returns —
// the per-slot pools, weapon/perk display data, collection-sourced exotics,
// alternate releases, and everyone's equipped loadout reference — plus the
// banned-type filtering that produces the pool rolls actually draw from.

export interface WeaponDetail {
  name: string;
  icon: string;
  watermark?: string;
  weaponType: string;
  damageType: string;
  tierType: number;
  tierName: string;
  ammoType: string;
  stats: Record<string, number>;
}

export type InstancePerks = Record<
  string,
  Array<{ instanceId: string; perks: string[]; location: string; characterId?: string }>
>;

export function useWeaponPool(lobbyId: string, bannedTypes: Set<string>) {
  const [intersection, setIntersection] = useState<Record<WeaponSlot, number[]> | null>(null);
  const [weaponDetails, setWeaponDetails] = useState<Record<string, WeaponDetail>>({});
  const [instancePerks, setInstancePerks] = useState<InstancePerks>({});
  const [collectionHashes, setCollectionHashes] = useState<Set<number>>(new Set());
  // Sibling item hashes for other releases (re-releases/Adept) of an intersection
  // weapon that I personally own, keyed by the representative hash (#47).
  const [weaponReleases, setWeaponReleases] = useState<Record<string, number[]>>({});
  // The caller's currently-equipped weapon per slot, captured when the pool
  // loads — used to seed the captain's initial loadout from equipped.
  const [equippedHashes, setEquippedHashes] = useState<Partial<Record<WeaponSlot, number>>>({});
  // Everyone's currently-equipped weapons (live from Bungie on every pool
  // load), keyed by user id - shown under each fireteam member as a reference.
  const [memberEquipped, setMemberEquipped] = useState<
    Record<string, Partial<Record<WeaponSlot, number>>>
  >({});
  const [intersectionError, setIntersectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadIntersection = useCallback(
    async (selectedCharId: string | null) => {
      setLoading(true);
      setIntersectionError(null);
      try {
        const res = await fetch("/api/roulette/intersection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lobbyId, characterId: selectedCharId ?? undefined }),
        });
        const data = await res.json();
        if (!data.intersection) {
          setIntersectionError(data.error ?? "Failed to load shared weapons");
          setLoading(false);
          return;
        }
        setIntersection(data.intersection);
        setWeaponDetails(data.weaponDetails ?? {});
        setInstancePerks(data.instancePerks ?? {});
        setCollectionHashes(new Set<number>(data.collectionHashes ?? []));
        setWeaponReleases(data.weaponReleases ?? {});
        const eq = data.equippedHashes as Record<string, number | null> | undefined;
        const equipped: Partial<Record<WeaponSlot, number>> = {};
        for (const slot of ["kinetic", "energy", "power"] as WeaponSlot[]) {
          if (eq?.[slot] != null) equipped[slot] = eq[slot]!;
        }
        setEquippedHashes(equipped);
        setMemberEquipped(data.memberEquipped ?? {});
      } catch (e) {
        setIntersectionError(e instanceof Error ? e.message : "Network error");
      }
      setLoading(false);
    },
    [lobbyId]
  );

  // Build a display type key that distinguishes special-ammo weapons (e.g. Rocket
  // Sidearms) from their primary-ammo counterparts by appending " · Special".
  const weaponDisplayType = useCallback(
    (h: number): string => {
      const d = weaponDetails[h.toString()];
      if (!d) return "";
      return d.ammoType === "Special" ? `${d.weaponType} · Special` : d.weaponType;
    },
    [weaponDetails]
  );

  // Pool with banned weapon types removed - drives both the browser and rolls.
  const effectiveIntersection = useMemo(() => {
    if (!intersection) return null;
    if (bannedTypes.size === 0) return intersection;
    const filt = (arr: number[]) => arr.filter((h) => !bannedTypes.has(weaponDisplayType(h)));
    return {
      kinetic: filt(intersection.kinetic),
      energy: filt(intersection.energy),
      power: filt(intersection.power),
    };
  }, [intersection, bannedTypes, weaponDisplayType]);

  return {
    intersection,
    effectiveIntersection,
    weaponDetails,
    instancePerks,
    collectionHashes,
    weaponReleases,
    equippedHashes,
    memberEquipped,
    intersectionError,
    loading,
    loadIntersection,
    weaponDisplayType,
  };
}
