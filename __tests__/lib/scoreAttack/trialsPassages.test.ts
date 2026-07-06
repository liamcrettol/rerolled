/** @jest-environment node */
import { extractTrialsPassageSnapshots, selectTrialsPassageCard, type TrialsPassageSnapshot } from "@/lib/scoreAttack/trialsPassages";
import type { BungieProfileResponse, DestinyItemComponent } from "@/types/bungie";

function item(overrides: Partial<DestinyItemComponent>): DestinyItemComponent {
  return {
    itemHash: 0,
    itemInstanceId: "item-1",
    quantity: 1,
    bindStatus: 0,
    location: 1,
    bucketHash: 0,
    transferStatus: 0,
    lockable: false,
    state: 0,
    ...overrides,
  };
}

function snapshot(overrides: Partial<TrialsPassageSnapshot>): TrialsPassageSnapshot {
  return {
    passageInstanceId: "card-1",
    passageItemHash: 3125852681,
    passageName: "Passage of Mercy",
    bucketHash: 1345459588,
    source: "character",
    characterId: "char-1",
    wins: 0,
    roundsWon: 0,
    activeWinStreak: 0,
    flawlessWinStreak: 0,
    flawlessProgress: 0,
    isFlawless: false,
    isComplete: false,
    trialsMultiplier: null,
    objectiveProgress: {},
    ...overrides,
  };
}

describe("extractTrialsPassageSnapshots", () => {
  it("extracts and dedupes Trials passages while deriving summary fields", () => {
    const profile: BungieProfileResponse = {
      characters: { data: {} },
      characterInventories: {
        data: {
          "char-1": {
            items: [
              item({
                itemHash: 3125852681,
                itemInstanceId: "card-1",
                bucketHash: 1345459588,
              }),
            ],
          },
        },
      },
      characterEquipment: { data: {} },
      profileInventory: {
        data: {
          items: [
            item({
              itemHash: 3125852681,
              itemInstanceId: "card-1",
              bucketHash: 1345459588,
            }),
            item({
              itemHash: 1507733275,
              itemInstanceId: "card-7",
              bucketHash: 1345459588,
            }),
          ],
        },
      },
      itemComponents: {
        instances: { data: {} },
        objectives: {
          data: {
            "card-1": {
              objectives: [
                { objectiveHash: 1586211619, progress: 3, completionValue: 7, complete: false, visible: true },
                { objectiveHash: 2369244651, progress: 0, completionValue: 1, complete: false, visible: true },
                { objectiveHash: 984122744, progress: 15, completionValue: 1, complete: true, visible: true },
              ],
            },
          },
        },
        sockets: { data: {} },
        reusablePlugs: { data: {} },
      },
    };

    const snapshots = extractTrialsPassageSnapshots(profile);
    expect(snapshots).toHaveLength(2);
    expect(snapshots).toContainEqual(expect.objectContaining({
      passageInstanceId: "card-1",
      passageName: "Passage of Mercy",
      source: "character",
      wins: 3,
      roundsWon: 15,
      isFlawless: false,
      isComplete: false,
    }));
    expect(snapshots).toContainEqual(expect.objectContaining({
      passageInstanceId: "card-7",
      passageName: "Any 7-Win Passage",
      wins: 0,
      isComplete: true,
    }));
  });
});

describe("selectTrialsPassageCard", () => {
  it("prefers the passage whose wins advanced on a winning match", () => {
    const selected = selectTrialsPassageCard({
      isWin: true,
      preMatchSnapshots: [
        snapshot({ passageInstanceId: "active-card", wins: 2, roundsWon: 10, objectiveProgress: { "1586211619": 2 } }),
        snapshot({ passageInstanceId: "old-card", wins: 7, isComplete: true, objectiveProgress: { "1586211619": 7 } }),
      ],
      postMatchSnapshots: [
        snapshot({ passageInstanceId: "active-card", wins: 3, roundsWon: 15, objectiveProgress: { "1586211619": 3, "984122744": 15 } }),
        snapshot({ passageInstanceId: "old-card", wins: 7, isComplete: true, objectiveProgress: { "1586211619": 7 } }),
      ],
    });

    expect(selected).toEqual({
      cardId: "active-card",
      winsOnCard: 3,
      isFlawless: false,
      isComplete: false,
    });
  });

  it("can still identify the active card on a loss via a flawless-state change", () => {
    const selected = selectTrialsPassageCard({
      isWin: false,
      preMatchSnapshots: [
        snapshot({
          passageInstanceId: "active-card",
          wins: 5,
          isFlawless: true,
          objectiveProgress: { "1586211619": 5, "2369244651": 1 },
        }),
        snapshot({
          passageInstanceId: "old-card",
          wins: 7,
          isComplete: true,
          objectiveProgress: { "1586211619": 7 },
        }),
      ],
      postMatchSnapshots: [
        snapshot({
          passageInstanceId: "active-card",
          wins: 5,
          isFlawless: false,
          objectiveProgress: { "1586211619": 5, "2369244651": 0 },
        }),
        snapshot({
          passageInstanceId: "old-card",
          wins: 7,
          isComplete: true,
          objectiveProgress: { "1586211619": 7 },
        }),
      ],
    });

    expect(selected?.cardId).toBe("active-card");
    expect(selected?.winsOnCard).toBe(5);
  });
});
