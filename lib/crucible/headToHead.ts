import { adminSupabase } from "@/lib/supabase/admin";
import { resolveActivity } from "@/lib/bungie/pgcr";
import { crucibleModeName } from "./modes";
import { classifyCrucibleMode } from "./modes";
import type {
  CrucibleModeBucket,
  HeadToHeadMeeting,
  HeadToHeadModeRecord,
  HeadToHeadSummary,
} from "./types";

const MAX_RECENT_MEETINGS = 12;

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

interface MatchMetadata {
  activityName: string | null;
  modeName: string;
}

interface MatchMetadataRow {
  instance_id: string;
  activity_hash: number | null;
  activity_name: string | null;
  activity_mode: number | null;
  activity_modes: number[] | null;
  mode_bucket: CrucibleModeBucket;
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

function metadataForRow(row: MatchMetadataRow, modeBucket = row.mode_bucket, activityModes = row.activity_modes ?? []): MatchMetadata {
  return {
    activityName: row.activity_name,
    modeName: crucibleModeName({
      activityMode: row.activity_mode,
      activityModes,
      modeBucket,
    }),
  };
}

async function loadMatchMetadata(db: Db, instanceIds: string[]): Promise<Map<string, MatchMetadata>> {
  const metadata = new Map<string, MatchMetadata>();
  if (instanceIds.length === 0) return metadata;
  const { data, error } = await db
    .from("crucible_matches")
    .select("instance_id, activity_hash, activity_name, activity_mode, activity_modes, mode_bucket")
    .in("instance_id", instanceIds);
  if (error) throw new Error(`Head-to-head match lookup failed: ${error.message}`);

  await Promise.all((data ?? []).map(async (match: MatchMetadataRow) => {
    const storedModes = match.activity_modes ?? [];
    let activityModes = storedModes;
    let modeBucket = match.mode_bucket;
    // Older imports did not merge activity-definition modes, so a competitive
    // Clash can arrive with only the generic Clash mode (71) and be mislabeled.
    if (match.activity_hash != null && modeBucket === "other") {
      const definition = await resolveActivity(Number(match.activity_hash));
      activityModes = [...new Set([...storedModes, ...definition.modes])];
      modeBucket = classifyCrucibleMode({
        activityMode: match.activity_mode,
        activityModes,
        activityHash: Number(match.activity_hash),
        activityName: match.activity_name,
      });
    }
    metadata.set(match.instance_id, metadataForRow(match, modeBucket, activityModes));
  }));
  return metadata;
}

function fallbackModeName(mode: CrucibleModeBucket): string {
  return crucibleModeName({ activityMode: null, activityModes: [], modeBucket: mode });
}

export function summarizeEncounterRows(
  rows: EncounterRow[],
  matchMetadata: Map<string, MatchMetadata> = new Map(),
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
    if (summary.recentMeetings.length < MAX_RECENT_MEETINGS) {
      const metadata = matchMetadata.get(row.instance_id);
      summary.recentMeetings.push({
        instanceId: row.instance_id,
        playedAt: row.played_at,
        mode: row.mode_bucket,
        modeName: metadata?.modeName ?? fallbackModeName(row.mode_bucket),
        viewerWon: row.viewer_won,
        activityName: metadata?.activityName ?? null,
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
  const matchMetadata = new Map<string, MatchMetadata>();
  if (instanceIds.length > 0) {
    const matchBatches = Array.from({ length: Math.ceil(instanceIds.length / 100) }, (_, index) => instanceIds.slice(index * 100, (index + 1) * 100));
    for (const batch of matchBatches) {
      const batchMetadata = await loadMatchMetadata(db, batch);
      for (const [instanceId, metadata] of batchMetadata) matchMetadata.set(instanceId, metadata);
    }
  }
  return summarizeEncounterRows(rows, matchMetadata);
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
  const metadata = new Map<string, MatchMetadata>();
  if (ids.length > 0) {
    const loaded = await loadMatchMetadata(db, ids);
    for (const [instanceId, matchMetadata] of loaded) metadata.set(instanceId, matchMetadata);
  }
  const meetings = page.map((row) => {
    const match = metadata.get(row.instance_id);
    return {
      instanceId: row.instance_id,
      playedAt: row.played_at,
      mode: row.mode_bucket,
      modeName: match?.modeName ?? fallbackModeName(row.mode_bucket),
      viewerWon: row.viewer_won,
      activityName: match?.activityName ?? null,
    };
  });
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last
    ? Buffer.from(`${last.played_at}|${last.instance_id}`, "utf8").toString("base64url")
    : null;
  return { matches: meetings, nextCursor };
}
