/** @jest-environment node */
import {
  computeRunEligibility,
  computeSnapshotCompliance,
  computeWeaponUsageCompliance,
} from "@/lib/scoreAttack/compliance";
import type {
  EquipmentSnapshot,
  NormalizedPgcrPlayer,
  RolledWeaponExpectation,
} from "@/lib/scoreAttack/types";

const expectedWeapons: RolledWeaponExpectation[] = [
  { slot: "kinetic", weaponHash: 1001, itemInstanceId: "i-1001" },
];

function player(overrides: Partial<NormalizedPgcrPlayer> = {}): NormalizedPgcrPlayer {
  return {
    membershipId: "player-1",
    membershipType: 3,
    displayName: "RunnerOne",
    characterIds: ["char-1"],
    kills: 100,
    assists: 10,
    deaths: 2,
    precisionKills: 20,
    superKills: 5,
    grenadeKills: 3,
    meleeKills: 2,
    weaponDataAvailable: true,
    weapons: [
      { weaponHash: 1001, kills: 80, precisionKills: 20, weaponType: "Bow" },
      { weaponHash: 9001, kills: 20, precisionKills: 0, weaponType: "Auto Rifle" },
    ],
    ...overrides,
  };
}

function snapshot(onLoadout: boolean, index: number): EquipmentSnapshot {
  return {
    capturedAt: `2026-07-05T18:0${index}:00Z`,
    membershipId: "player-1",
    characterId: "char-1",
    weapons: [
      onLoadout
        ? { slot: "kinetic", weaponHash: 1001, itemHash: 1001, itemInstanceId: "i-1001" }
        : { slot: "kinetic", weaponHash: 9999, itemHash: 9999, itemInstanceId: "i-9999" },
    ],
  };
}

describe("Score Attack compliance", () => {
  it("marks a clean run eligible", () => {
    const result = computeRunEligibility({
      player: player(),
      expectedWeapons,
      snapshots: [0, 1, 2, 3, 4].map((index) => snapshot(true, index)),
    });

    expect(result.status).toBe("eligible");
    expect(result.weaponUsage.usageRatio).toBe(0.8);
    expect(result.snapshots.offLoadoutRate).toBe(0);
  });

  it("allows one bad snapshot at the eligible threshold", () => {
    const result = computeSnapshotCompliance({
      expectedWeapons,
      snapshots: [
        snapshot(false, 0),
        snapshot(true, 1),
        snapshot(true, 2),
        snapshot(true, 3),
        snapshot(true, 4),
      ],
    });

    expect(result.status).toBe("eligible");
    expect(result.offLoadoutSnapshots).toBe(1);
    expect(result.offLoadoutRate).toBe(0.2);
  });

  it("marks an obvious mid-run swap ineligible", () => {
    const result = computeSnapshotCompliance({
      expectedWeapons,
      snapshots: [
        snapshot(false, 0),
        snapshot(false, 1),
        snapshot(false, 2),
        snapshot(true, 3),
        snapshot(true, 4),
      ],
    });

    expect(result.status).toBe("ineligible");
    expect(result.offLoadoutRate).toBe(0.6);
    expect(result.reasons).toContain("off_loadout_snapshot_rate_too_high");
  });

  it("requires the expected instance ID when one is known", () => {
    const result = computeSnapshotCompliance({
      expectedWeapons,
      snapshots: [
        {
          capturedAt: "2026-07-05T18:00:00Z",
          weapons: [
            { slot: "kinetic", weaponHash: 1001, itemHash: 1001, itemInstanceId: "wrong-instance" },
          ],
        },
      ],
    });

    expect(result.status).toBe("ineligible");
    expect(result.offLoadoutRate).toBe(1);
  });

  it("marks low rolled weapon usage ineligible", () => {
    const result = computeWeaponUsageCompliance({
      player: player({
        weapons: [
          { weaponHash: 1001, kills: 35, precisionKills: 8 },
          { weaponHash: 9001, kills: 65, precisionKills: 1 },
        ],
      }),
      expectedWeapons,
    });

    expect(result.status).toBe("ineligible");
    expect(result.usageRatio).toBe(0.35);
    expect(result.reasons).toContain("rolled_weapon_usage_too_low");
  });

  it("returns unknown when PGCR weapon data is missing", () => {
    const result = computeRunEligibility({
      player: player({ weaponDataAvailable: false, weapons: [] }),
      expectedWeapons,
      snapshots: [snapshot(true, 0), snapshot(true, 1)],
    });

    expect(result.status).toBe("unknown");
    expect(result.weaponUsage.reasons).toContain("missing_pgcr_weapon_data");
  });

  it("returns unknown for weapon usage when only expected instance IDs are available", () => {
    const result = computeWeaponUsageCompliance({
      player: player(),
      expectedWeapons: [{ slot: "kinetic", itemInstanceId: "i-1001" }],
    });

    expect(result.status).toBe("unknown");
    expect(result.reasons).toContain("missing_expected_weapon_hashes");
  });

  it("marks no weapon kills ineligible", () => {
    const result = computeWeaponUsageCompliance({
      player: player({ weapons: [] }),
      expectedWeapons,
    });

    expect(result.status).toBe("ineligible");
    expect(result.reasons).toContain("no_weapon_kills");
  });

  it("enforces required weekly weapon type usage", () => {
    const result = computeRunEligibility({
      player: player(),
      expectedWeapons,
      snapshots: [snapshot(true, 0), snapshot(true, 1), snapshot(true, 2)],
      weeklyRequirement: { weaponType: "Bow", minimumUsageRatio: 0.7 },
    });

    expect(result.status).toBe("eligible");
    expect(result.weeklyRequirement?.usageRatio).toBe(0.8);
  });

  it("fails required weekly weapon type usage when the ratio is too low", () => {
    const result = computeRunEligibility({
      player: player({
        weapons: [
          { weaponHash: 1001, kills: 50, precisionKills: 10, weaponType: "Bow" },
          { weaponHash: 9001, kills: 50, precisionKills: 0, weaponType: "Auto Rifle" },
        ],
      }),
      expectedWeapons,
      snapshots: [snapshot(true, 0), snapshot(true, 1), snapshot(true, 2)],
      weeklyRequirement: { weaponType: "Bow", minimumUsageRatio: 0.7 },
    });

    expect(result.status).toBe("ineligible");
    expect(result.weeklyRequirement?.reasons).toContain("weekly_required_weapon_usage_too_low");
  });
});
