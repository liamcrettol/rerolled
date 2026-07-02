import { matchesBestRoll, scoreBestRoll, type BestRoll } from "@/lib/bestRolls";

const bestRoll: BestRoll = {
  weaponType: "Hand Cannon",
  frame: "Adaptive Frame",
  exampleWeapons: null,
  barrel: "Hammer-Forged Rifling",
  magazine: "Ricochet Rounds",
  perk1: "Slideshot",
  perk2: "Opening Shot",
  priorityMasterwork: "Range",
  priorityStat1: null,
  priorityStat2: null,
  notes: null,
};

describe("best roll scoring", () => {
  it("scores barrel, magazine, perks, and masterwork as the five god-roll slots", () => {
    const score = scoreBestRoll(bestRoll, {
      barrelName: "Smallbore",
      magazineName: "Ricochet Rounds",
      perkNames: ["Slideshot", "Opening Shot"],
      masterworkName: "Range Masterwork",
    });

    expect(score).toEqual({ matched: 4, total: 5 });
  });

  it("treats a full five-out-of-five roll as a best-roll match", () => {
    expect(
      matchesBestRoll(bestRoll, {
        barrelName: "Hammer-Forged Rifling",
        magazineName: "Ricochet Rounds",
        perkNames: ["Slideshot", "Opening Shot"],
        masterworkName: "Range Masterwork",
      })
    ).toBe(true);
  });
});
