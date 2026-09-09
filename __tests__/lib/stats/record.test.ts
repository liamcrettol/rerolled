/** @jest-environment node */
import { detectAndRecordGame } from "@/lib/stats/record";
import { collectPostMatchStats, resolveActivityName } from "@/lib/bungie/pgcr";
import { adminSupabase } from "@/lib/supabase/admin";

jest.mock("@/lib/bungie/pgcr", () => ({
  collectPostMatchStats: jest.fn(),
  resolveActivityName: jest.fn().mockResolvedValue("Test Map"),
}));

jest.mock("@/lib/lobby", () => ({
  rotateCaptain: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: jest.fn() },
}));

const mockCollect = collectPostMatchStats as jest.MockedFunction<typeof collectPostMatchStats>;

const postMatchResult = {
  playerStats: [
    {
      userId: "user-1",
      displayName: "Guardian",
      kills: 10,
      deaths: 2,
      assists: 3,
      kd: 5,
      rouletteWeaponKills: 4,
      won: true,
    },
  ],
  weaponKills: [{ itemHash: 111, totalKills: 4 }],
  instanceId: "instance-1",
  activityHash: 222,
  isPrivate: false,
};

// Routes `adminSupabase.from(table)` calls to per-table canned responses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(config: Record<string, any>) {
  return jest.fn((table: string) => {
    const cfg = config[table] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      insert: (rows: unknown) => {
        cfg.inserted = rows;
        return builder;
      },
      delete: () => {
        cfg.deleted = true;
        return builder;
      },
      // advanceRoundAndRotate upserts the next round on
      // (lobby_id, round_number) so a retry after a partial failure cannot
      // collide with the row a previous attempt already wrote.
      upsert: (rows: unknown) => {
        cfg.upserted = rows;
        return Promise.resolve(cfg.upsertResult ?? { data: null, error: null });
      },
      update: () => builder,
      single: async () => cfg.single ?? { data: null, error: null },
      maybeSingle: async () => cfg.maybeSingle ?? { data: null, error: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve: any) => resolve(cfg.terminal ?? { data: null, error: null }),
    };
    return builder;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCollect.mockResolvedValue(postMatchResult);
  (resolveActivityName as jest.Mock).mockResolvedValue("Test Map");
});

describe("detectAndRecordGame", () => {
  const baseParams = {
    lobbyId: "lobby-1",
    roundId: "round-1",
    appliedAt: new Date().toISOString(),
    members: [
      {
        userId: "user-1",
        displayName: "Guardian",
        membershipType: 3,
        membershipId: "999",
        characterId: "char-1",
      },
    ],
    rouletteHashes: [111],
    token: "fake-token",
    tokenOwnerUserId: "user-1",
  };

  it("rolls back the orphaned game_session and throws when the player_game_stats insert fails", async () => {
    const config: { game_sessions: { single: unknown; deleted?: boolean }; player_game_stats: { terminal: unknown } } = {
      game_sessions: { single: { data: { id: "session-1" }, error: null } },
      player_game_stats: { terminal: { data: null, error: { message: "insert failed" } } },
    };
    (adminSupabase.from as jest.Mock) = makeDb(config);

    // Without the rollback, game_sessions(round_id) stays committed with no
    // player_game_stats rows, and every caller that checks "does a session
    // exist for this round" (the cron's getLobbyIdsAwaitingDetection, the
    // client detect route's own existing-session check) would treat the
    // round as fully detected forever - no stats, no captain rotation, no
    // next round, and nothing ever retries it.
    await expect(detectAndRecordGame(baseParams)).rejects.toThrow(
      /Failed to persist player_game_stats for round round-1/
    );
    expect(config.game_sessions.deleted).toBe(true);
  });

  it("logs and still records + advances the round when the weapon_round_kills insert fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (adminSupabase.from as jest.Mock) = makeDb({
      game_sessions: { single: { data: { id: "session-1" }, error: null } },
      player_game_stats: { terminal: { data: null, error: null } },
      weapon_round_kills: { terminal: { data: null, error: { message: "insert failed" } } },
      lobby_rounds: { single: { data: { captain_rotated: true }, error: null } },
      lobbies: { single: { data: { current_round: 1, captain_locked: true }, error: null } },
    });

    // player_game_stats is already committed by the time weapon_round_kills
    // runs, so the round is correctly recorded either way - throwing here
    // would only skip advanceRoundAndRotate and strand the lobby despite
    // having valid stats.
    const outcome = await detectAndRecordGame(baseParams);
    expect(outcome.status).toBe("recorded");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("weapon_round_kills"),
      expect.objectContaining({ reason: "insert failed" })
    );
    errorSpy.mockRestore();
  });

  it("records normally when both inserts succeed", async () => {
    (adminSupabase.from as jest.Mock) = makeDb({
      game_sessions: { single: { data: { id: "session-1" }, error: null } },
      player_game_stats: { terminal: { data: null, error: null } },
      weapon_round_kills: { terminal: { data: null, error: null } },
      lobby_rounds: { single: { data: { captain_rotated: true }, error: null } },
      lobbies: { single: { data: { current_round: 1, captain_locked: true }, error: null } },
    });

    const outcome = await detectAndRecordGame(baseParams);
    expect(outcome.status).toBe("recorded");
  });
});
