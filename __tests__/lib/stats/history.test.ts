import {
  buildSeasonMatchHistory,
  buildTrialsReportUrl,
  type SeasonRunHistoryRow,
  type SeasonRunLoadoutRow,
  type SeasonRunParticipantRow,
  type SeasonWeeklyChallengeRow,
} from "@/lib/stats/history";
import type { NormalizedPgcr } from "@/lib/scoreAttack/types";

describe("buildTrialsReportUrl", () => {
  it("builds a player profile URL when membership data is available", () => {
    expect(buildTrialsReportUrl(3, "4611686018429783295")).toBe(
      "https://destinytrialsreport.com/report/3/4611686018429783295",
    );
  });

  it("returns null when membership data is missing", () => {
    expect(buildTrialsReportUrl(null, "461")).toBeNull();
    expect(buildTrialsReportUrl(3, "")).toBeNull();
  });
});

describe("buildSeasonMatchHistory", () => {
  const runs: SeasonRunHistoryRow[] = [
    {
      id: "run-1",
      mode: "weekly_challenge",
      status: "finalized",
      pgcr_instance_id: "pgcr-1",
      completed_at: "2026-07-09T03:10:00.000Z",
      created_at: "2026-07-09T03:00:00.000Z",
      weekly_challenge_id: "weekly-1",
    },
  ];

  const participants: SeasonRunParticipantRow[] = [
    {
      run_id: "run-1",
      user_id: "user-1",
      bungie_membership_id: "m-1",
      bungie_membership_type: 3,
    },
    {
      run_id: "run-1",
      user_id: "user-2",
      bungie_membership_id: "m-2",
      bungie_membership_type: 3,
    },
  ];

  const loadoutRows: SeasonRunLoadoutRow[] = [
    { run_id: "run-1", slot: "power", weapon_name: "Tomorrow's Answer", weapon_icon: "/power.png" },
    { run_id: "run-1", slot: "kinetic", weapon_name: "The Messenger", weapon_icon: "/kinetic.png" },
    { run_id: "run-1", slot: "energy", weapon_name: "Matador 64", weapon_icon: "/energy.png" },
  ];

  const weeklyChallenges: SeasonWeeklyChallengeRow[] = [
    {
      id: "weekly-1",
      title: "Scout Rifle Supremacy",
      activity_name_snapshot: "Control",
    },
  ];

  const pgcr: NormalizedPgcr = {
    kind: "pvp",
    instanceId: "pgcr-1",
    activityHash: 123,
    directorActivityHash: null,
    activityMode: 5,
    activityModes: [5],
    period: "2026-07-09T03:00:00.000Z",
    startTime: "2026-07-09T03:00:00.000Z",
    endTime: "2026-07-09T03:10:00.000Z",
    durationSeconds: 600,
    completed: true,
    isSupported: true,
    warnings: [],
    teams: [
      { teamId: 17, standing: 0, score: 5 },
      { teamId: 18, standing: 1, score: 2 },
    ],
    players: [
      {
        membershipId: "m-1",
        membershipType: 3,
        displayName: "Memo",
        characterIds: [],
        kills: 8,
        assists: 3,
        deaths: 4,
        precisionKills: 2,
        superKills: 0,
        grenadeKills: 0,
        meleeKills: 0,
        weapons: [],
        weaponDataAvailable: true,
        team: 17,
        standing: 0,
        isWin: true,
        score: 1500,
        medalKeys: [],
        scoreboardValues: {},
        completed: true,
      },
      {
        membershipId: "m-2",
        membershipType: 3,
        displayName: "Kaiuzo",
        characterIds: [],
        kills: 7,
        assists: 2,
        deaths: 5,
        precisionKills: 1,
        superKills: 0,
        grenadeKills: 0,
        meleeKills: 0,
        weapons: [],
        weaponDataAvailable: true,
        team: 17,
        standing: 0,
        isWin: true,
        score: 1200,
        medalKeys: [],
        scoreboardValues: {},
        completed: true,
      },
      {
        membershipId: "m-3",
        membershipType: 2,
        displayName: "EnemyOne",
        characterIds: [],
        kills: 10,
        assists: 1,
        deaths: 6,
        precisionKills: 4,
        superKills: 0,
        grenadeKills: 0,
        meleeKills: 0,
        weapons: [],
        weaponDataAvailable: true,
        team: 18,
        standing: 1,
        isWin: false,
        score: 1000,
        medalKeys: [],
        scoreboardValues: {},
        completed: true,
      },
    ],
  };

  it("splits a PvP PGCR into your team and opponents and sorts loadout slots", () => {
    const matches = buildSeasonMatchHistory({
      runs,
      participants,
      loadoutRows,
      weeklyChallenges,
      pgcrByInstanceId: new Map([["pgcr-1", pgcr]]),
      viewerUserId: "user-1",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      runId: "run-1",
      result: "win",
      activityName: "Control",
      challengeTitle: "Scout Rifle Supremacy",
      teamLabel: "Your Team",
      opponentLabel: "Enemy Team",
      teamScore: 5,
      opponentScore: 2,
    });
    expect(matches[0].team.map((player) => player.displayName)).toEqual(["Memo", "Kaiuzo"]);
    expect(matches[0].opponents.map((player) => player.displayName)).toEqual(["EnemyOne"]);
    expect(matches[0].team[0].isCurrentUser).toBe(true);
    expect(matches[0].team[0].trialsReportUrl).toBe("https://destinytrialsreport.com/report/3/m-1");
    expect(matches[0].loadout.map((slot) => slot.slot)).toEqual(["kinetic", "energy", "power"]);
  });

  it("skips runs without a parsed PGCR or a supported state", () => {
    const matches = buildSeasonMatchHistory({
      runs: [{ ...runs[0], status: "expired", pgcr_instance_id: null }],
      participants,
      loadoutRows,
      weeklyChallenges,
      pgcrByInstanceId: new Map(),
      viewerUserId: "user-1",
    });

    expect(matches).toEqual([]);
  });
});
