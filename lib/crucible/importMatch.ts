import { adminSupabase } from "@/lib/supabase/admin";
import { parsePgcr } from "@/lib/scoreAttack/pgcr";
import { classifyCrucibleMode } from "./modes";

// Supabase's generated schema is intentionally not checked into this project.
// Keep the dependency structural so importer tests can use a tiny fake DB.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rawIsPrivate(raw: unknown): boolean {
  const wrapped = asRecord(raw);
  const pgcr = asRecord(wrapped?.Response) ?? wrapped;
  const details = asRecord(pgcr?.activityDetails);
  return details?.isPrivate === true;
}

function requireNoError(result: { error?: unknown } | null | undefined, operation: string) {
  if (result?.error) throw new Error(`${operation} failed: ${String(result.error)}`);
}

export async function importCrucibleMatch(input: {
  viewerUserId: string;
  viewerMembershipId: string;
  rawPgcr: unknown;
  activityName?: string | null;
  activityImage?: string | null;
  db?: Db;
}): Promise<{ imported: boolean; encounterCount: number }> {
  const db = input.db ?? adminSupabase;
  const pgcr = parsePgcr(input.rawPgcr);
  if (!pgcr.isSupported || pgcr.kind !== "pvp" || !pgcr.instanceId || !pgcr.period) {
    return { imported: false, encounterCount: 0 };
  }

  const viewer = pgcr.players.find((player) => player.membershipId === input.viewerMembershipId);
  if (!viewer) return { imported: false, encounterCount: 0 };

  const modeBucket = classifyCrucibleMode({
    activityMode: pgcr.activityMode,
    activityModes: pgcr.activityModes,
    activityHash: pgcr.activityHash,
    activityName: input.activityName,
  });
  const now = new Date().toISOString();
  const isPrivate = rawIsPrivate(input.rawPgcr);

  const matchRow: Record<string, unknown> = {
    instance_id: pgcr.instanceId,
    activity_hash: pgcr.activityHash,
    activity_mode: pgcr.activityMode,
    activity_modes: pgcr.activityModes,
    mode_bucket: modeBucket,
    activity_name: input.activityName ?? null,
    activity_image: input.activityImage ?? null,
    period: pgcr.period,
    duration_seconds: pgcr.durationSeconds,
    is_private: isPrivate,
    team_data: pgcr.teams,
    updated_at: now,
  };
  // activity_image lands with migration 050; if it hasn't been applied yet, drop
  // the column and retry so importing never breaks on a not-yet-migrated column.
  let matchResult = await db.from("crucible_matches").upsert(matchRow, { onConflict: "instance_id" });
  if (matchResult?.error && /activity_image/.test(String(matchResult.error.message ?? matchResult.error))) {
    const { activity_image: _omit, ...withoutImage } = matchRow;
    void _omit;
    matchResult = await db.from("crucible_matches").upsert(withoutImage, { onConflict: "instance_id" });
  }
  requireNoError(matchResult, "match upsert");

  const playerRows = pgcr.players.map((player) => ({
    instance_id: pgcr.instanceId,
    membership_id: player.membershipId,
    membership_type: player.membershipType,
    display_name: player.displayName ?? "Guardian",
    team_id: player.team,
    is_win: player.isWin,
    completed: player.completed,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    score: player.score,
    updated_at: now,
  }));
  requireNoError(await db.from("crucible_match_players").upsert(playerRows, {
    onConflict: "instance_id,membership_id",
  }), "player upsert");

  // Free-for-all and malformed reports do not expose a trustworthy opponent
  // boundary. Keep their source rows, but never invent head-to-head records.
  if (viewer.team === null) return { imported: true, encounterCount: 0 };
  const opponents = pgcr.players.filter(
    (player) => player.team !== null && player.team !== viewer.team,
  );
  if (opponents.length === 0) return { imported: true, encounterCount: 0 };

  const encounters = opponents.map((opponent) => ({
    viewer_user_id: input.viewerUserId,
    viewer_membership_id: input.viewerMembershipId,
    opponent_membership_id: opponent.membershipId,
    opponent_membership_type: opponent.membershipType,
    opponent_display_name: opponent.displayName ?? "Guardian",
    instance_id: pgcr.instanceId,
    mode_bucket: modeBucket,
    viewer_won: viewer.isWin,
    played_at: pgcr.period,
  }));
  requireNoError(await db.from("crucible_encounters").upsert(encounters, {
    onConflict: "viewer_user_id,opponent_membership_id,instance_id",
  }), "encounter upsert");

  return { imported: true, encounterCount: encounters.length };
}

