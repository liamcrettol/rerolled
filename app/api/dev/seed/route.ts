import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/helpers";

const LOBBY_ID = "00000000-0000-0000-0000-000000000001";
const LOBBY_CODE = "TEST01";

// This endpoint writes/wipes test data. It is disabled entirely on production
// deployments (any signed-in user could otherwise reset the shared test lobby
// and its fake stats) and requires a logged-in session everywhere else.
async function requireAuth(): Promise<NextResponse | null> {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await requireSession();
    return null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

const USERS = [
  { id: "test_bungie_001", display_name: "SolarFlare99" },
  { id: "test_bungie_002", display_name: "VoidWalker_X" },
  { id: "test_bungie_003", display_name: "ArcStrike7" },
  { id: "test_bungie_004", display_name: "GhostWhisper" },
];

const GAMES = [
  {
    id: "00000000-0000-0000-0001-000000000001",
    hoursAgo: 5,
    stats: [
      { userId: "test_bungie_001", displayName: "SolarFlare99", rk: 8, k: 15, d: 8, a: 4 },
      { userId: "test_bungie_002", displayName: "VoidWalker_X", rk: 12, k: 20, d: 7, a: 6 },
      { userId: "test_bungie_003", displayName: "ArcStrike7", rk: 3, k: 9, d: 14, a: 2 },
      { userId: "test_bungie_004", displayName: "GhostWhisper", rk: 7, k: 13, d: 10, a: 4 },
    ],
  },
  {
    id: "00000000-0000-0000-0001-000000000002",
    hoursAgo: 4,
    stats: [
      { userId: "test_bungie_001", displayName: "SolarFlare99", rk: 11, k: 18, d: 6, a: 7 },
      { userId: "test_bungie_002", displayName: "VoidWalker_X", rk: 5, k: 11, d: 11, a: 3 },
      { userId: "test_bungie_003", displayName: "ArcStrike7", rk: 9, k: 15, d: 8, a: 5 },
      { userId: "test_bungie_004", displayName: "GhostWhisper", rk: 13, k: 21, d: 5, a: 8 },
    ],
  },
  {
    id: "00000000-0000-0000-0001-000000000003",
    hoursAgo: 3,
    stats: [
      { userId: "test_bungie_001", displayName: "SolarFlare99", rk: 6, k: 12, d: 9, a: 3 },
      { userId: "test_bungie_002", displayName: "VoidWalker_X", rk: 15, k: 23, d: 4, a: 8 },
      { userId: "test_bungie_003", displayName: "ArcStrike7", rk: 11, k: 18, d: 6, a: 7 },
      { userId: "test_bungie_004", displayName: "GhostWhisper", rk: 4, k: 9, d: 13, a: 2 },
    ],
  },
  {
    id: "00000000-0000-0000-0001-000000000004",
    hoursAgo: 2,
    stats: [
      { userId: "test_bungie_001", displayName: "SolarFlare99", rk: 14, k: 22, d: 5, a: 9 },
      { userId: "test_bungie_002", displayName: "VoidWalker_X", rk: 7, k: 14, d: 9, a: 5 },
      { userId: "test_bungie_003", displayName: "ArcStrike7", rk: 5, k: 10, d: 11, a: 3 },
      { userId: "test_bungie_004", displayName: "GhostWhisper", rk: 18, k: 26, d: 2, a: 11 },
    ],
  },
  {
    id: "00000000-0000-0000-0001-000000000005",
    hoursAgo: 1,
    stats: [
      { userId: "test_bungie_001", displayName: "SolarFlare99", rk: 9, k: 16, d: 7, a: 5 },
      { userId: "test_bungie_002", displayName: "VoidWalker_X", rk: 10, k: 17, d: 6, a: 4 },
      { userId: "test_bungie_003", displayName: "ArcStrike7", rk: 16, k: 24, d: 3, a: 10 },
      { userId: "test_bungie_004", displayName: "GhostWhisper", rk: 6, k: 12, d: 9, a: 4 },
    ],
  },
];

export async function POST() {
  const unauthorized = await requireAuth();
  if (unauthorized) return unauthorized;
  try {
    // 1. Upsert test users
    const { error: userErr } = await adminSupabase
      .from("users")
      .upsert(USERS, { onConflict: "id" });
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });

    // 2. Delete existing test lobby (cascades to sessions/members/stats)
    await adminSupabase.from("lobbies").delete().eq("id", LOBBY_ID);

    // 3. Insert lobby
    const { error: lobbyErr } = await adminSupabase.from("lobbies").insert({
      id: LOBBY_ID,
      code: LOBBY_CODE,
      host_user_id: "test_bungie_001",
      captain_user_id: "test_bungie_002",
      status: "waiting",
      current_round: 6,
    });
    if (lobbyErr) return NextResponse.json({ error: lobbyErr.message }, { status: 500 });

    // 4. Insert lobby members
    await adminSupabase.from("lobby_members").insert(
      USERS.map((u, i) => ({
        lobby_id: LOBBY_ID,
        user_id: u.id,
        display_name: u.display_name,
        bungie_membership_type: 3,
        bungie_membership_id: u.id,
        is_ready: true,
        is_captain: i === 1,
      }))
    );

    // 5. Insert game sessions and stats
    for (const game of GAMES) {
      const playedAt = new Date(Date.now() - game.hoursAgo * 60 * 60 * 1000).toISOString();
      await adminSupabase.from("game_sessions").insert({
        id: game.id,
        lobby_id: LOBBY_ID,
        played_at: playedAt,
        player_count: 4,
        roulette_hashes: [1234567890, 9876543210, 1122334455],
      });

      await adminSupabase.from("player_game_stats").insert(
        game.stats.map((s) => ({
          game_session_id: game.id,
          user_id: s.userId,
          display_name: s.displayName,
          kills: s.k,
          deaths: s.d,
          assists: s.a,
          kd: s.d > 0 ? Number((s.k / s.d).toFixed(2)) : s.k,
          roulette_weapon_kills: s.rk,
        }))
      );
    }

    return NextResponse.json({
      ok: true,
      lobbyCode: LOBBY_CODE,
      message: "Seeded: 4 players, 5 games.",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  const unauthorized = await requireAuth();
  if (unauthorized) return unauthorized;
  await adminSupabase.from("lobbies").delete().eq("id", LOBBY_ID);
  await adminSupabase.from("users").delete().like("id", "test_bungie_%");
  return NextResponse.json({ ok: true, message: "Test data cleared." });
}
