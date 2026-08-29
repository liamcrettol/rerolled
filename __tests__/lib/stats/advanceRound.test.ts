/** @jest-environment node */
// advanceRoundAndRotate (lib/stats/record.ts) is the ONLY path that opens a new
// round for a roulette lobby - /api/lobby/next-round is wired to DraftBoard
// only. Its three writes ignored their errors, and supabase-js resolves with
// { error } rather than throwing.
//
// The consequence is the reported "stopped rotating, and we have to refresh to
// roll": if the round write is dropped but current_round still advances, the
// lobby points at a round with no row. And if the whole advance is dropped, the
// lobby is stranded on a round whose captain_rotated is already true, so
// mark_player_applied never rotates again, while the client's round load (keyed
// on current_round) never refetches.

import { detectAndRecordGame } from "@/lib/stats/record";
import { collectPostMatchStats, resolveActivityName } from "@/lib/bungie/pgcr";
import { adminSupabase } from "@/lib/supabase/admin";

jest.mock("@/lib/bungie/pgcr", () => ({
  collectPostMatchStats: jest.fn(),
  resolveActivityName: jest.fn().mockResolvedValue("Test Map"),
}));
jest.mock("@/lib/lobby", () => ({ rotateCaptain: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ adminSupabase: { from: jest.fn() } }));

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

type TableCfg = {
  single?: { data: unknown; error: unknown };
  maybeSingle?: { data: unknown; error: unknown };
  terminal?: { data: unknown; error: unknown };
  upsertError?: { message: string };
  currentRoundError?: { message: string };
};

// Records what the round-advance actually wrote, so a test can assert that
// current_round did NOT move when the round write failed.
function makeDb(config: Record<string, TableCfg>, spy: { roundUpsert?: unknown; currentRound?: number | null }) {
  return jest.fn((table: string) => {
    const cfg = config[table] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      insert: () => builder,
      upsert: (rows: Record<string, unknown>, opts: unknown) => {
        if (table === "lobby_rounds") {
          spy.roundUpsert = { rows, opts };
          return Promise.resolve({ data: null, error: cfg.upsertError ?? null });
        }
        return builder;
      },
      update: (patch: Record<string, unknown>) => {
        if (table === "lobbies" && "current_round" in patch) {
          if (cfg.currentRoundError) {
            return { eq: async () => ({ data: null, error: cfg.currentRoundError }) };
          }
          spy.currentRound = patch.current_round as number;
        }
        return { eq: async () => ({ data: null, error: null }) };
      },
      single: async () => cfg.single ?? { data: null, error: null },
      maybeSingle: async () => cfg.maybeSingle ?? { data: null, error: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve: any) => resolve(cfg.terminal ?? { data: null, error: null }),
    };
    return builder;
  });
}

const baseParams = {
  lobbyId: "lobby-1",
  roundId: "round-1",
  appliedAt: new Date().toISOString(),
  members: [
    { userId: "user-1", displayName: "Guardian", membershipType: 3, membershipId: "999", characterId: "char-1" },
  ],
  rouletteHashes: [111],
  token: "fake-token",
  tokenOwnerUserId: "user-1",
};

const happyTables = {
  game_sessions: { single: { data: { id: "session-1" }, error: null } },
  player_game_stats: { terminal: { data: null, error: null } },
  weapon_round_kills: { terminal: { data: null, error: null } },
  lobby_rounds: { single: { data: { captain_rotated: true }, error: null } },
  lobbies: { single: { data: { current_round: 4, captain_locked: true }, error: null } },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCollect.mockResolvedValue(postMatchResult);
  (resolveActivityName as jest.Mock).mockResolvedValue("Test Map");
});

describe("advanceRoundAndRotate", () => {
  it("opens the next round idempotently so a retry cannot collide", async () => {
    const spy: { roundUpsert?: unknown; currentRound?: number | null } = {};
    (adminSupabase.from as jest.Mock) = makeDb(happyTables, spy);

    await detectAndRecordGame(baseParams);

    // (lobby_id, round_number) is unique (001_initial.sql); a plain insert
    // would make any retry after a partial failure fail permanently.
    expect(spy.roundUpsert).toMatchObject({
      rows: { lobby_id: "lobby-1", round_number: 5 },
      opts: { onConflict: "lobby_id,round_number" },
    });
    expect(spy.currentRound).toBe(5);
  });

  it("does not advance current_round when the round write fails", async () => {
    const spy: { roundUpsert?: unknown; currentRound?: number | null } = {};
    (adminSupabase.from as jest.Mock) = makeDb(
      { ...happyTables, lobby_rounds: { ...happyTables.lobby_rounds, upsertError: { message: "timed out" } } },
      spy
    );

    await detectAndRecordGame(baseParams);

    // The wedge: pointing current_round at a round with no row leaves the
    // lobby unable to roll at all.
    expect(spy.currentRound).toBeUndefined();
  });
});
