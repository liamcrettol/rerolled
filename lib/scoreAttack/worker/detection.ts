// Bungie-detection worker handlers (#247/#248/#254 wiring).
//
// The second half of the pipeline: watch a run's activity, read the PGCR, and
// turn it into a score + compliance + legality verdict, then hand off to the
// finalize handlers. The pure transforms (parse / score / compliance / legality)
// are covered by fixtures; the Bungie HTTP calls are shape-dependent and need a
// real completed activity to fully verify.
//
//   capture_equipment_snapshot -+
//   poll_activity_history --? fetch_pgcr --? parse_pgcr --? compute_score -? update_leaderboard / award_badges
//                                                        +? compute_compliance
//                                                        +? compute_legality

import { adminSupabase } from "@/lib/supabase/admin";
import { getBungieToken } from "@/lib/auth/helpers";
import { BungieWorkerClient } from "@/lib/bungie/workerClient";
import { parsePgcr } from "@/lib/scoreAttack/pgcr";
import { scoreAttackRun, pvpScoreAttackRun } from "@/lib/scoreAttack/scoring";
import { getActivityDifficultyMultiplier } from "@/lib/scoreAttack/activityPool";
import { computeRunEligibility, type WeeklyWeaponRequirement } from "@/lib/scoreAttack/compliance";
import { computeRunLegality } from "@/lib/scoreAttack/legality";
import { extractTrialsPassageSnapshots, type TrialsPassageCapturePhase } from "@/lib/scoreAttack/trialsPassages";
import { weeklyWeaponRequirementFromRules } from "@/lib/challenges/rules";
import { bucketToSlot, type BungieProfileResponse, type WeaponSlot } from "@/types/bungie";
import type {
  EquipmentSnapshot,
  NormalizedPgcr,
  RolledWeaponExpectation,
} from "@/lib/scoreAttack/types";
import { enqueueJob } from "./store";
import { syncPlayerStats } from "./stats";
import type { WorkerJobRow } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const MAX_DETECTION_WINDOW_MS = 2 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 90_000;
const SNAPSHOT_INTERVAL_MS = 120_000;
const TRIALS_PASSAGE_PROFILE_COMPONENTS = [200, 201, 205, 102, 300, 301].join(",");

function withinWindow(startedAt: string | null): boolean {
  if (!startedAt) return true;
  return Date.now() - new Date(startedAt).getTime() < MAX_DETECTION_WINDOW_MS;
}
function bucket(intervalMs: number): number {
  return Math.floor(Date.now() / intervalMs);
}
export interface DetectionDeps {
  db?: Db;
  client?: Pick<BungieWorkerClient, "get" | "fetchPgcr">;
  tokenFor?: (userId: string) => Promise<string>;
}

function deps(d: DetectionDeps = {}) {
  return {
    db: d.db ?? adminSupabase,
    client: d.client ?? new BungieWorkerClient(),
    tokenFor: d.tokenFor ?? getBungieToken,
  };
}

async function loadRun(db: Db, runId: string) {
  const { data } = await db.from("challenge_runs").select("*").eq("id", runId).maybeSingle();
  return data;
}

async function loadOwner(db: Db, run: { id: string; created_by: string }) {
  const { data } = await db
    .from("challenge_run_participants")
    .select("user_id, bungie_membership_id, bungie_membership_type, character_id")
    .eq("run_id", run.id)
    .eq("user_id", run.created_by)
    .maybeSingle();
  return data;
}

async function loadParticipants(db: Db, runId: string) {
  const { data } = await db
    .from("challenge_run_participants")
    .select("user_id, bungie_membership_id, bungie_membership_type, character_id")
    .eq("run_id", runId);
  return data ?? [];
}

async function loadExpectedWeapons(db: Db, runId: string): Promise<RolledWeaponExpectation[]> {
  const { data } = await db
    .from("challenge_run_loadout_slots")
    .select("slot, item_hash, weapon_type, is_wildcard")
    .eq("run_id", runId);
  return (data ?? []).map((r: { slot: WeaponSlot; item_hash: number; weapon_type: string | null; is_wildcard: boolean }) => ({
    slot: r.slot,
    weaponHash: r.item_hash,
    weaponType: r.weapon_type ?? undefined,
    optional: r.is_wildcard,
  }));
}

async function loadNormalizedPgcr(db: Db, instanceId: string): Promise<NormalizedPgcr | null> {
  const { data } = await db.from("pgcr_cache").select("normalized_pgcr").eq("instance_id", instanceId).maybeSingle();
  return data?.normalized_pgcr ?? null;
}

async function loadWeeklyVersionRules(db: Db, versionId: string) {
  const { data } = await db
    .from("weekly_challenge_versions")
    .select("rules")
    .eq("id", versionId)
    .maybeSingle();
  return data?.rules ?? null;
}

export async function captureEquipmentSnapshotHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db, client, tokenFor } = deps(d);
  const p = job.payload as { runId: string; membershipId: string; membershipType: number; characterId: string };
  const run = await loadRun(db, p.runId);
  if (!run) return;
  const owner = await loadOwner(db, run);
  if (!owner) return;

  const token = await tokenFor(owner.user_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = await client.get(
    `/Destiny2/${p.membershipType}/Profile/${p.membershipId}/?components=205`,
    token,
  );
  const items: Array<{ itemHash: number; bucketHash: number }> =
    profile?.characterEquipment?.data?.[p.characterId]?.items ?? [];
  const equipped = items
    .map((i) => ({ slot: bucketToSlot(i.bucketHash), weaponHash: i.itemHash }))
    .filter((w): w is { slot: WeaponSlot; weaponHash: number } => !!w.slot);

  const expected = await loadExpectedWeapons(db, p.runId);
  await db.from("run_equipment_snapshots").insert({
    run_id: p.runId,
    user_id: owner.user_id,
    bungie_membership_id: p.membershipId,
    bungie_membership_type: p.membershipType,
    character_id: p.characterId,
    captured_at: new Date().toISOString(),
    equipped,
    expected,
  });

  const active = ["applied", "in_activity"].includes(run.status);
  if (active && withinWindow(run.started_at)) {
    await enqueueJob(
      {
        jobType: "capture_equipment_snapshot",
        runId: p.runId,
        payload: p,
        runAt: new Date(Date.now() + SNAPSHOT_INTERVAL_MS).toISOString(),
        dedupeKey: `capture:${p.runId}:${bucket(SNAPSHOT_INTERVAL_MS)}`,
      },
      db,
    );
  }
}

export async function captureTrialsPassageSnapshotHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db, client, tokenFor } = deps(d);
  const p = job.payload as {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
    capturePhase: TrialsPassageCapturePhase;
  };
  const run = await loadRun(db, p.runId);
  if (!run) return;
  const owner = await loadOwner(db, run);
  if (!owner) return;

  const token = await tokenFor(owner.user_id);
  const profile = await client.get<BungieProfileResponse>(
    `/Destiny2/${p.membershipType}/Profile/${p.membershipId}/?components=${TRIALS_PASSAGE_PROFILE_COMPONENTS}`,
    token,
  );
  const snapshots = extractTrialsPassageSnapshots(profile);
  if (!snapshots.length) return;

  const capturedAt = new Date().toISOString();
  await db.from("run_trials_passage_snapshots").upsert(
    snapshots.map((snapshot) => ({
      run_id: p.runId,
      user_id: owner.user_id,
      bungie_membership_id: p.membershipId,
      capture_phase: p.capturePhase,
      passage_instance_id: snapshot.passageInstanceId,
      passage_item_hash: snapshot.passageItemHash,
      passage_name: snapshot.passageName,
      bucket_hash: snapshot.bucketHash,
      character_id: snapshot.characterId,
      wins: snapshot.wins,
      rounds_won: snapshot.roundsWon,
      active_win_streak: snapshot.activeWinStreak,
      flawless_win_streak: snapshot.flawlessWinStreak,
      flawless_progress: snapshot.flawlessProgress,
      is_flawless: snapshot.isFlawless,
      is_complete: snapshot.isComplete,
      trials_multiplier: snapshot.trialsMultiplier,
      raw_objectives: snapshot.objectiveProgress,
      captured_at: capturedAt,
    })),
    { onConflict: "run_id,user_id,capture_phase,passage_instance_id" },
  );
}

export async function pollActivityHistoryHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db, client, tokenFor } = deps(d);
  const p = job.payload as { runId: string; membershipId: string; membershipType: number; characterId: string; appliedAt?: string };
  const run = await loadRun(db, p.runId);
  if (!run) return;
  const owner = await loadOwner(db, run);
  if (!owner) return;

  const token = await tokenFor(owner.user_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: any = await client.get(
    `/Destiny2/${p.membershipType}/Account/${p.membershipId}/Character/${p.characterId}/Stats/Activities/?mode=0&count=10`,
    token,
  );
  const activities: Array<{ period: string; activityDetails: { instanceId: string; directorActivityHash: number }; values: { completed?: { basic?: { value?: number } } } }> =
    history?.activities ?? [];
  const since = p.appliedAt ? new Date(p.appliedAt).getTime() : 0;

  const match = activities.find(
    (a) =>
      new Date(a.period).getTime() >= since &&
      (run.activity_hash == null || Number(a.activityDetails.directorActivityHash) === Number(run.activity_hash)) &&
      (a.values?.completed?.basic?.value ?? 0) === 1,
  );
  if (!match) {
    if (["applied", "in_activity"].includes(run.status) && withinWindow(run.started_at)) {
      await enqueueJob(
        {
          jobType: "poll_activity_history",
          runId: p.runId,
          payload: p,
          runAt: new Date(Date.now() + POLL_INTERVAL_MS).toISOString(),
          dedupeKey: `poll:${p.runId}:${bucket(POLL_INTERVAL_MS)}`,
        },
        db,
      );
    }
    return;
  }

  await db.from("challenge_runs").update({
    activity_hash: Number(match.activityDetails.directorActivityHash),
    pgcr_instance_id: match.activityDetails.instanceId,
    status: "completed_pending_pgcr",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", p.runId);

  await enqueueJob({ jobType: "fetch_pgcr", runId: p.runId, payload: { runId: p.runId, instanceId: match.activityDetails.instanceId } }, db);
}

export async function fetchPgcrHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db, client } = deps(d);
  const p = job.payload as { runId: string; instanceId: string };
  const raw = await client.fetchPgcr(p.instanceId);
  await db.from("pgcr_cache").upsert(
    { instance_id: p.instanceId, source: "bungie", raw_pgcr: raw, status: "fetched", fetched_at: new Date().toISOString() },
    { onConflict: "instance_id" },
  );
  await db.from("challenge_runs").update({ status: "pgcr_fetched", updated_at: new Date().toISOString() }).eq("id", p.runId);
  await enqueueJob({ jobType: "parse_pgcr", runId: p.runId, payload: { runId: p.runId, instanceId: p.instanceId } }, db);
}

export async function parsePgcrHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db } = deps(d);
  const p = job.payload as { runId: string; instanceId: string };
  const { data: cache } = await db.from("pgcr_cache").select("raw_pgcr").eq("instance_id", p.instanceId).maybeSingle();
  if (!cache?.raw_pgcr) throw new Error(`pgcr ${p.instanceId} not cached`);

  const normalized = parsePgcr(cache.raw_pgcr);
  await db.from("pgcr_cache").update({ normalized_pgcr: normalized, status: "normalized", updated_at: new Date().toISOString() }).eq("instance_id", p.instanceId);

  const run = await loadRun(db, p.runId);
  if (!run) return;
  await db.from("challenge_runs").update({ status: "parsed", updated_at: new Date().toISOString() }).eq("id", p.runId);
  const owner = await loadOwner(db, run);
  const membershipId = owner?.bungie_membership_id;
  if (!membershipId) return;

  if (owner?.character_id) {
    await enqueueJob({
      jobType: "capture_trials_passage_snapshot",
      runId: p.runId,
      payload: {
        runId: p.runId,
        membershipId,
        membershipType: owner.bungie_membership_type ?? 3,
        characterId: owner.character_id,
        capturePhase: "post_match",
      },
    }, db);
  }
  await enqueueJob({ jobType: "compute_score", runId: p.runId, payload: { runId: p.runId, playerMembershipId: membershipId } }, db);
  await enqueueJob({ jobType: "compute_compliance", runId: p.runId, payload: { runId: p.runId, playerMembershipId: membershipId } }, db);
  await enqueueJob({ jobType: "compute_legality", runId: p.runId, payload: { runId: p.runId } }, db);
}

export async function computeScoreHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db } = deps(d);
  const p = job.payload as { runId: string; playerMembershipId: string };
  const run = await loadRun(db, p.runId);
  if (!run?.pgcr_instance_id) return;

  const pgcr = await loadNormalizedPgcr(db, run.pgcr_instance_id);
  if (!pgcr) throw new Error(`normalized pgcr missing for run ${p.runId}`);

  const expected = await loadExpectedWeapons(db, p.runId);
  const rolledWeaponHashes = expected
    .map((e) => e.weaponHash)
    .filter((h): h is number => typeof h === "number");

  const difficultyMultiplier = getActivityDifficultyMultiplier(run.activity_hash);
  // PvE's clear-time/completion formula doesn't map to a Crucible match
  // (#296) - dispatch on the same NormalizedPgcr discriminated union the
  // rest of the pipeline already uses.
  const result = pgcr.kind === "pvp"
    ? pvpScoreAttackRun({
        pgcr,
        playerMembershipId: p.playerMembershipId,
        rolledWeaponHashes,
        config: { difficultyMultiplier },
      })
    : scoreAttackRun({
        pgcr,
        playerMembershipId: p.playerMembershipId,
        rolledWeaponHashes,
        config: { difficultyMultiplier },
      });

  await db.from("challenge_runs").update({
    score: result.totalScore,
    scoring_breakdown: result.breakdown,
    status: "scored",
    updated_at: new Date().toISOString(),
  }).eq("id", p.runId);

  await enqueueJob({ jobType: "update_leaderboard", runId: p.runId, payload: { runId: p.runId } }, db);
  await enqueueJob({ jobType: "award_badges", runId: p.runId, payload: { runId: p.runId } }, db);

  await syncPlayerStats({ userId: run.created_by, seasonId: run.season_id ?? null }, db);
}

export async function computeComplianceHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db } = deps(d);
  const p = job.payload as { runId: string; playerMembershipId: string };
  const run = await loadRun(db, p.runId);
  if (!run?.pgcr_instance_id) return;

  const pgcr = await loadNormalizedPgcr(db, run.pgcr_instance_id);
  if (!pgcr) return;

  const expected = await loadExpectedWeapons(db, p.runId);
  const player = pgcr.players.find((pl) => pl.membershipId === p.playerMembershipId) ?? null;

  const { data: snapRows } = await db
    .from("run_equipment_snapshots")
    .select("captured_at, bungie_membership_id, character_id, equipped")
    .eq("run_id", p.runId)
    .eq("bungie_membership_id", p.playerMembershipId);
  const snapshots: EquipmentSnapshot[] = (snapRows ?? []).map((s: { captured_at: string; bungie_membership_id: string; character_id: string | null; equipped: unknown }) => ({
    capturedAt: s.captured_at,
    membershipId: s.bungie_membership_id,
    characterId: s.character_id ?? undefined,
    weapons: Array.isArray(s.equipped) ? (s.equipped as EquipmentSnapshot["weapons"]) : [],
  }));

  let weeklyRequirement: WeeklyWeaponRequirement | undefined;
  if (run.mode === "weekly_challenge" && run.weekly_challenge_version_id) {
    const rules = await loadWeeklyVersionRules(db, run.weekly_challenge_version_id);
    weeklyRequirement = weeklyWeaponRequirementFromRules(rules);
  }

  const eligibility = computeRunEligibility({ player, expectedWeapons: expected, snapshots, weeklyRequirement });

  await db.from("run_compliance_results").upsert({
    run_id: p.runId,
    user_id: run.created_by,
    bungie_membership_id: p.playerMembershipId,
    status: eligibility.status,
    weapon_usage_ratio: eligibility.weaponUsage.usageRatio,
    off_loadout_snapshot_rate: eligibility.snapshots.offLoadoutRate,
    reasons: eligibility.reasons,
    evaluated_at: new Date().toISOString(),
  }, { onConflict: "run_id" });

  await db.from("challenge_runs").update({ compliance_status: eligibility.status, updated_at: new Date().toISOString() }).eq("id", p.runId);
}

export async function computeLegalityHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db } = deps(d);
  const p = job.payload as { runId: string };
  const run = await loadRun(db, p.runId);
  if (!run?.pgcr_instance_id) return;

  const pgcr = await loadNormalizedPgcr(db, run.pgcr_instance_id);
  if (!pgcr) throw new Error(`normalized pgcr missing for run ${p.runId}`);

  const [expected, participants] = await Promise.all([
    loadExpectedWeapons(db, p.runId),
    loadParticipants(db, p.runId),
  ]);
  if (!participants.length) return;

  const evaluatedAt = new Date().toISOString();
  const rows = participants.map((participant: { user_id: string; bungie_membership_id: string | null }) => {
    const player = participant.bungie_membership_id
      ? pgcr.players.find((entry) => entry.membershipId === participant.bungie_membership_id) ?? null
      : null;
    const legality = computeRunLegality({ player, expectedWeapons: expected });
    return {
      run_id: p.runId,
      user_id: participant.user_id,
      is_valid: legality.isValid,
      had_active_loadout: legality.hadActiveLoadout,
      rolled_final_blows: legality.rolledFinalBlows,
      illegal_final_blows: legality.illegalFinalBlows,
      illegal_sources: legality.illegalSources,
      rolled_weapons_used: legality.rolledWeaponsUsed,
      evaluated_at: evaluatedAt,
    };
  });

  await db.from("run_legality_results").upsert(rows, { onConflict: "run_id,user_id" });
}
