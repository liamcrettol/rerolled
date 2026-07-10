import { getHeadToHeadSummaries, summarizeEncounterRows, type EncounterRow } from "@/lib/crucible/headToHead";

const row = (overrides: Partial<EncounterRow> = {}): EncounterRow => ({
  opponent_membership_id: "opp-1",
  opponent_membership_type: 3,
  opponent_display_name: "Rival",
  instance_id: "match-1",
  mode_bucket: "control",
  viewer_won: true,
  played_at: "2026-07-09T20:00:00Z",
  ...overrides,
});

describe("summarizeEncounterRows", () => {
  it("builds viewer-perspective totals, mode records, and recent meetings", () => {
    const summaries = summarizeEncounterRows([
      row({ mode_bucket: "competitive" }),
      row({ instance_id: "match-2", mode_bucket: "trials", viewer_won: false, played_at: "2026-07-08T20:00:00Z" }),
      row({ instance_id: "match-3", mode_bucket: "trials", viewer_won: null, played_at: "2026-07-07T20:00:00Z" }),
    ], new Map([[
      "match-1",
      { activityName: "Endless Vale", modeName: "Competitive Clash" },
    ]]));

    expect(summaries["opp-1"]).toMatchObject({
      encounters: 3,
      wins: 1,
      losses: 1,
      unknown: 1,
      lastPlayedAt: "2026-07-09T20:00:00Z",
      byMode: {
        competitive: { encounters: 1, wins: 1, losses: 0, unknown: 0 },
        trials: { encounters: 2, wins: 0, losses: 1, unknown: 1 },
      },
    });
    expect(summaries["opp-1"].recentMeetings[0]).toMatchObject({
      activityName: "Endless Vale",
      modeName: "Competitive Clash",
    });
  });

  it("keeps opponents separate and uses the newest display-name snapshot", () => {
    const summaries = summarizeEncounterRows([
      row({ opponent_display_name: "New Name" }),
      row({ instance_id: "older", opponent_display_name: "Old Name", played_at: "2026-01-01T00:00:00Z" }),
      row({ opponent_membership_id: "opp-2", opponent_display_name: "Other" }),
    ]);
    expect(summaries["opp-1"].opponentDisplayName).toBe("New Name");
    expect(summaries["opp-2"].encounters).toBe(1);
  });
});

describe("getHeadToHeadSummaries", () => {
  it("batches more than 50 visible opponents instead of returning fake 0-0 records", async () => {
    const encounters = Array.from({ length: 51 }, (_, index) => row({
      opponent_membership_id: `opp-${index}`,
      instance_id: `match-${index}`,
    }));
    const requestedBatches: string[][] = [];
    // Structural fake for the small PostgREST query surface used here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = {
      from(table: string) {
        let ids: string[] = [];
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          in: (_column: string, values: string[]) => {
            ids = values;
            if (table === "crucible_encounters") requestedBatches.push(values);
            return chain;
          },
          then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
            const data = table === "crucible_encounters"
              ? encounters.filter((entry) => ids.includes(entry.opponent_membership_id))
              : ids.map((instanceId) => ({
                  instance_id: instanceId,
                  activity_name: "Control",
                  activity_mode: 10,
                  activity_modes: [10],
                  mode_bucket: "control",
                }));
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return chain;
      },
    };

    const summaries = await getHeadToHeadSummaries({
      viewerUserId: "viewer",
      opponentMembershipIds: encounters.map((entry) => entry.opponent_membership_id),
      db,
    });

    expect(requestedBatches.map((batch) => batch.length)).toEqual([50, 1]);
    expect(summaries["opp-50"]).toMatchObject({ encounters: 1, wins: 1, losses: 0 });
    expect(summaries["opp-50"].recentMeetings[0].modeName).toBe("Control");
  });
});
