/** @jest-environment node */
import { computeRunLegality } from "@/lib/scoreAttack/legality";

const player = {
  membershipId: "4611686018429000001",
  membershipType: 3,
  displayName: "RunnerOne",
  characterIds: ["char-alpha"],
  kills: 12,
  assists: 4,
  deaths: 1,
  precisionKills: 5,
  superKills: 1,
  grenadeKills: 2,
  meleeKills: 0,
  weapons: [
    { weaponHash: 1001, kills: 7, precisionKills: 3, weaponType: "Auto Rifle" },
    { weaponHash: 1002, kills: 2, precisionKills: 0, weaponType: "Sidearm" },
  ],
  weaponDataAvailable: true,
};

describe("computeRunLegality", () => {
  it("computes strict zero-tolerance legality and source details", () => {
    const result = computeRunLegality({
      player,
      expectedWeapons: [{ weaponHash: 1001 }],
    });

    expect(result).toEqual({
      isValid: false,
      hadActiveLoadout: true,
      rolledFinalBlows: 7,
      illegalFinalBlows: 5,
      illegalSources: ["grenade", "super", "off_roll_weapon:1002"],
      rolledWeaponsUsed: [1001],
    });
  });

  it("marks a run valid only when there are zero illegal final blows", () => {
    const result = computeRunLegality({
      player: {
        ...player,
        superKills: 0,
        grenadeKills: 0,
        weapons: [{ weaponHash: 1001, kills: 7, precisionKills: 3, weaponType: "Auto Rifle" }],
      },
      expectedWeapons: [{ weaponHash: 1001 }],
    });

    expect(result.isValid).toBe(true);
    expect(result.illegalFinalBlows).toBe(0);
    expect(result.illegalSources).toEqual([]);
  });

  it("fails closed when there is no active rolled loadout", () => {
    const result = computeRunLegality({
      player,
      expectedWeapons: [],
    });

    expect(result.hadActiveLoadout).toBe(false);
    expect(result.isValid).toBe(false);
  });
});
