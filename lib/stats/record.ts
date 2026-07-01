import { adminSupabase } from "@/lib/supabase/admin";
import {
  collectPostMatchStats,
  resolveActivityName,
  type MemberStatInput,
  type CollectedPlayerStat,
} from "@/lib/bungie/pgcr";
import { rotateCaptain } from "@/lib/lobby";

type RecordOutcome =
  // Game found and persisted by this call.
  | { status: "recorded"; stats: CollectedPlayerStat[] }
  // Another worker already persisted this round (lost the unique-index race).
  | { status: "already_recorded"; stats: CollectedPlayerStat[] }
  // PGCR not available yet — caller should keep polling.
  | { status: "no_game" };

interface RecordParams {
  lobbyId: string;
  roundId: string;
  appliedAt: string;
  members: MemberStatInput[];
  rouletteHashes: number[];
  token: string;
  tokenOwnerUserId: string;
}

function mapStoredStats(
  rows: Array<{
    user_id: string;
    display_name: string;
    kills: number;
    deaths: number;
    assists: number;
    kd: number | string;
    roulette_weapon_kills: number;
    won?: boolean | null;
  }>
): CollectedPlayerStat[] {
  return rows.map((s) => ({
    userId: s.user_id,
    displayName: s.display_name,
    kills: s.kills,
    deaths: s.deaths,
    assists: s.assists,
    kd: Number(s.kd),
    rouletteWeaponKills: s.roulette_weapon_kills,
    won: s.won ?? null,
  }));
}

/**
 * Single source of truth for turning a finished game into persisted stats.
 * Both the client-polled detect route and the cron backstop call this, so the
 * recording logic (columns written, captain rotation, round advance) can never
 * drift between the two paths again.
 *
 * Assumes the caller has already confirmed no session exists yet and (for the
 * detect path) holds the detection lease. The unique index on
 * game_sessions(round_id) is the final guard against a concurrent insert.
 */
export async function detectAndRecordGame(params: RecordParams): Promise<RecordOutcome> {
  const { lobbyId, roundId, appliedAt, members, rouletteHashes, token, tokenOwnerUserId } = params;

  const result = await collectPostMatchStats(members, rouletteHashes, token, tokenOwnerUserId, appliedAt);
  if (!result) return { status: "no_game" };

  const { playerStats, weaponKills, activityHash, isPrivate } = result;
  const mapName = await resolveActivityName(activityHash);

  const { data: gameSession } = await adminSupabase
    .from("game_sessions")
    .insert({
      lobby_id: lobbyId,
      player_count: playerStats.length,
      roulette_hashes: rouletteHashes,
      round_id: roundId,
      map_name: mapName,
      activity_hash: activityHash,
      is_private: isPrivate,
    })
    .select()
    .single();

  // Insert returned nothing: a concurrent worker won the unique-index race.
  // Return whatever they recorded so the caller can surface it immediately.
  if (!gameSession) {
    const { data: existing } = await adminSupabase
      .from("game_sessions")
      .select("player_game_stats(*)")
      .eq("round_id", roundId)
      .maybeSingle();
    return { status: "already_recorded", stats: mapStoredStats(existing?.player_game_stats ?? []) };
  }

  await adminSupabase.from("player_game_stats").insert(
    playerStats.map((s) => ({
      game_session_id: gameSession.id,
      user_id: s.userId,
      display_name: s.displayName,
      kills: s.kills,
      deaths: s.deaths,
      assists: s.assists,
      kd: s.kd,
      roulette_weapon_kills: s.rouletteWeaponKills,
      won: s.won,
    }))
  );

  if (weaponKills.length) {
    await adminSupabase.from("weapon_round_kills").insert(
      weaponKills.map((w) => ({
        game_session_id: gameSession.id,
        item_hash: w.itemHash,
        total_kills: w.totalKills,
      }))
    );
  }

  await advanceRoundAndRotate(lobbyId, roundId);

  return { status: "recorded", stats: playerStats };
}

/**
 * Rotate the captain (unless someone already did this round, or the captain is
 * locked) and open the next round.
 */
async function advanceRoundAndRotate(lobbyId: string, roundId: string): Promise<void> {
  const { data: roundState } = await adminSupabase
    .from("lobby_rounds")
    .select("captain_rotated")
    .eq("id", roundId)
    .single();

  const { data: lobby } = await adminSupabase
    .from("lobbies")
    .select("current_round, captain_locked")
    .eq("id", lobbyId)
    .single();

  if (!roundState?.captain_rotated && !lobby?.captain_locked) {
    await rotateCaptain(lobbyId);
  }

  if (!lobby) return;

  const nextRound = lobby.current_round + 1;
  await adminSupabase.from("lobby_rounds").insert({
    lobby_id: lobbyId,
    round_number: nextRound,
    status: "pending",
  });
  await adminSupabase.from("lobby_members").update({ is_ready: false }).eq("lobby_id", lobbyId);
  // current_round must succeed even if migration 008 hasn't run.
  await adminSupabase.from("lobbies").update({ current_round: nextRound }).eq("id", lobbyId);
  // Best-effort status + timestamp (requires migration 008).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await adminSupabase.from("lobbies").update({ status: "waiting", last_active_at: new Date().toISOString() } as any).eq("id", lobbyId);
}
