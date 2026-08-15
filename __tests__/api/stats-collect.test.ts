/** @jest-environment node */
import { POST } from "@/app/api/stats/collect/route";
import { NextRequest } from "next/server";
import { collectPostMatchStats } from "@/lib/bungie/pgcr";
import { adminSupabase } from "@/lib/supabase/admin";

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "user-1",
    displayName: "Guardian",
    bungieMembershipType: 3,
    bungieMembershipId: "999",
  }),
  getBungieToken: jest.fn().mockResolvedValue("fake-token"),
}));

jest.mock("@/lib/bungie/pgcr", () => ({
  collectPostMatchStats: jest.fn(),
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
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      gte: () => builder,
      insert: (rows: unknown) => {
        cfg.inserted = rows;
        return builder;
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

function makeRequest() {
  return new NextRequest("https://example.com/api/stats/collect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lobbyId: "00000000-0000-0000-0000-000000000001" }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCollect.mockResolvedValue(postMatchResult);
});

describe("POST /api/stats/collect", () => {
  it("returns 500 instead of ok:true when the player_game_stats insert fails", async () => {
    (adminSupabase.from as jest.Mock) = makeDb({
      lobby_members: {
        terminal: {
          data: [
            {
              user_id: "user-1",
              display_name: "Guardian",
              bungie_membership_type: 3,
              bungie_membership_id: "999",
              selected_character_id: "char-1",
            },
          ],
          error: null,
        },
      },
      roll_history: {
        maybeSingle: {
          data: { applied_at: new Date().toISOString(), round_id: "round-1" },
          error: null,
        },
      },
      game_sessions: {
        // Both the "existing session" and the final race check should find nothing.
        maybeSingle: { data: null, error: null },
        // The real insert succeeds and returns a session row.
        single: { data: { id: "session-1" }, error: null },
      },
      lobby_loadout_slots: {
        terminal: { data: [{ item_hash: 111 }], error: null },
      },
      player_game_stats: {
        terminal: { data: null, error: { message: "insert failed: constraint violation" } },
      },
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Failed to persist player_game_stats/);
    // Must not report success once game_sessions is committed with no stats.
    expect(body.ok).not.toBe(true);
  });
});
