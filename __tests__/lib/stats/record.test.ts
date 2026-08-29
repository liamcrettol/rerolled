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

  it("throws instead of silently dropping stats when the player_game_stats insert fails", async () => {
    (adminSupabase.from as jest.Mock) = makeDb({
      game_sessions: { single: { data: { id: "session-1" }, error: null } },
      player_game_stats: { terminal: { data: null, error: { message: "insert failed" } } },
    });

    await expect(detectAndRecordGame(baseParams)).rejects.toThrow(
      /Failed to persist player_game_stats for round round-1/
    );
  });

  it("throws instead of silently dropping weapon kills when that insert fails", async () => {
    (adminSupabase.from as jest.Mock) = makeDb({
      game_sessions: { single: { data: { id: "session-1" }, error: null } },
      player_game_stats: { terminal: { data: null, error: null } },
      weapon_round_kills: { terminal: { data: null, error: { message: "insert failed" } } },
    });

    await expect(detectAndRecordGame(baseParams)).rejects.toThrow(
      /Failed to persist weapon_round_kills for round round-1/
    );
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
