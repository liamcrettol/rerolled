import { adminSupabase } from "@/lib/supabase/admin";
import type {
  CrucibleModeBucket,
  HeadToHeadMeeting,
  HeadToHeadModeRecord,
  HeadToHeadSummary,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface EncounterRow {
  opponent_membership_id: string;
  opponent_membership_type: number | null;
  opponent_display_name: string;
  instance_id: string;
  mode_bucket: CrucibleModeBucket;
  viewer_won: boolean | null;
  played_at: string;
}

function emptyRecord(): HeadToHeadModeRecord {
  return { encounters: 0, wins: 0, losses: 0, unknown: 0 };
}

function addResult(record: HeadToHeadModeRecord, won: boolean | null) {
  record.encounters++;
  if (won === true) record.wins++;
  else if (won === false) record.losses++;
  else record.unknown++;
}

export function summarizeEncounterRows(
  rows: EncounterRow[],
  matchNames: Map<string, string | null> = new Map(),
): Record<string, HeadToHeadSummary> {
  const summaries: Record<string, HeadToHeadSummary> = {};
  const sorted = [...rows].sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());

  for (const row of sorted) {
    const summary = summaries[row.opponent_membership_id] ??= {
      opponentMembershipId: row.opponent_membership_id,
      opponentMembershipType: row.opponent_membership_type,
      opponentDisplayName: row.opponent_display_name,
      ...emptyRecord(),
      lastPlayedAt: row.played_at,
      byMode: {},
      recentMeetings: [],
    };
    addResult(summary, row.viewer_won);
    const modeRecord = summary.byMode[row.mode_bucket] ??= emptyRecord();
    addResult(modeRecord, row.viewer_won);
    if (summary.recentMeetings.length < 3) {
      summary.recentMeetings.push({
        instanceId: row.instance_id,
        playedAt: row.played_at,
        mode: row.mode_bucket,
        viewerWon: row.viewer_won,
        activityName: matchNames.get(row.instance_id) ?? null,
      });
    }
  }
  return summaries;
}

export async function getHeadToHeadSummaries(input: {
  viewerUserId: string;
  opponentMembershipIds: string[];
  mode?: CrucibleModeBucket | "all";
  db?: Db;
}): Promise<Record<string, HeadToHeadSummary>> {
  const ids = [...new Set(input.opponentMembershipIds)];
  if (ids.length === 0) return {};
  const db = input.db ?? adminSupabase;
  const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, (index + 1) * 50));
  const results = await Promise.all(batches.map(async (batch) => {
    let query = db
      .from("crucible_encounters")
      .select("opponent_membership_id, opponent_membership_type, opponent_display_name, instance_id, mode_bucket, viewer_won, played_at")
      .eq("viewer_user_id", input.viewerUserId)
      .in("opponent_membership_id", batch)
      .order("played_at", { ascending: false });
    if (input.mode && input.mode !== "all") query = query.eq("mode_bucket", input.mode);
    const result = await query;
    if (result.error) throw new Error(`Head-to-head query failed: ${result.error.message}`);
    return (result.data ?? []) as EncounterRow[];
  }));
  const rows = results.flat();
  const instanceIds = [...new Set(rows.map((row) => row.instance_id))];
  const matchNames = new Map<string, string | null>();
  if (instanceIds.length > 0) {
    const matchBatches = Array.from({ length: Math.ceil(instanceIds.length / 100) }, (_, index) => instanceIds.slice(index * 100, (index + 1) * 100));
    const matchResults = await Promise.all(matchBatches.map((batch) => db
      .from("crucible_matches")
      .select("instance_id, activity_name")
      .in("instance_id", batch)));
    for (const result of matchResults) {
      if (result.error) throw new Error(`Head-to-head match lookup failed: ${result.error.message}`);
      for (const match of result.data ?? []) matchNames.set(match.instance_id, match.activity_name);
    }
  }
  return summarizeEncounterRows(rows, matchNames);
}

export async function getHeadToHeadSummary(input: {
  viewerUserId: string;
  opponentMembershipId: string;
  mode?: CrucibleModeBucket | "all";
  db?: Db;
}): Promise<HeadToHeadSummary | null> {
  const summaries = await getHeadToHeadSummaries({
    viewerUserId: input.viewerUserId,
    opponentMembershipIds: [input.opponentMembershipId],
    mode: input.mode,
    db: input.db,
  });
  return summaries[input.opponentMembershipId] ?? null;
}

export async function getHeadToHeadMatches(input: {
  viewerUserId: string;
  opponentMembershipId: string;
  mode?: CrucibleModeBucket | "all";
  cursor?: string;
  limit?: number;
  db?: Db;
}): Promise<{ matches: HeadToHeadMeeting[]; nextCursor: string | null }> {
  const db = input.db ?? adminSupabase;
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  let query = db.from("crucible_encounters")
    .select("opponent_membership_id, opponent_membership_type, opponent_display_name, instance_id, mode_bucket, viewer_won, played_at")
    .eq("viewer_user_id", input.viewerUserId)
    .eq("opponent_membership_id", input.opponentMembershipId)
    .order("played_at", { ascending: false })
    .order("instance_id", { ascending: false })
    .limit(limit + 1);
  if (input.mode && input.mode !== "all") query = query.eq("mode_bucket", input.mode);
  if (input.cursor) {
    const [playedAt, instanceId] = Buffer.from(input.cursor, "base64url").toString("utf8").split("|");
    if (!playedAt || !instanceId) throw new Error("Invalid head-to-head cursor");
    query = query.or(`played_at.lt.${playedAt},and(played_at.eq.${playedAt},instance_id.lt.${instanceId})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Head-to-head detail query failed: ${error.message}`);
  const rows = (data ?? []) as EncounterRow[];
  const page = rows.slice(0, limit);
  const ids = page.map((row) => row.instance_id);
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: matches } = await db.from("crucible_matches").select("instance_id, activity_name").in("instance_id", ids);
    for (const match of matches ?? []) names.set(match.instance_id, match.activity_name);
  }
  const meetings = page.map((row) => ({
    instanceId: row.instance_id,
    playedAt: row.played_at,
    mode: row.mode_bucket,
    viewerWon: row.viewer_won,
    activityName: names.get(row.instance_id) ?? null,
  }));
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last
    ? Buffer.from(`${last.played_at}|${last.instance_id}`, "utf8").toString("base64url")
    : null;
  return { matches: meetings, nextCursor };
}
