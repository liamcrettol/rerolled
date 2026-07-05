// Bungie-detection worker handlers (#247/#248/#254 wiring).
//
// The second half of the pipeline: watch a run's activity, read the PGCR, and
// turn it into a score + compliance verdict, then hand off to the finalize
// handlers. The pure transforms (parse / score / compliance) are covered by
// #260's fixtures; the Bungie HTTP calls are shape-dependent and need a real
// completed activity to fully verify — that's the remaining smoke-test.
//
//   capture_equipment_snapshot ─┐
//   poll_activity_history ──▶ fetch_pgcr ──▶ parse_pgcr ─┬▶ compute_score ─▶ update_leaderboard / award_badges
//                                                        └▶ compute_compliance

import { adminSupabase } from "@/lib/supabase/admin";
import { getBungieToken } from "@/lib/auth/helpers";
import { BungieWorkerClient } from "@/lib/bungie/workerClient";
import { parsePvEPgcr } from "@/lib/scoreAttack/pgcr";
import { scoreAttackRun } from "@/lib/scoreAttack/scoring";
import { computeRunEligibility } from "@/lib/scoreAttack/compliance";
import { bucketToSlot, type WeaponSlot } from "@/types/bungie";
import type {
  NormalizedPvEPgcr,
  RolledWeaponExpectation,
  EquipmentSnapshot,
} from "@/lib/scoreAttack/types";
import { enqueueJob } from "./store";
import { syncPlayerStats } from "./stats";
import type { WorkerJobRow } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// Recurring polls self-reschedule until the run is done or too old. A
// time-bucketed dedupe key lets successive windows enqueue while collapsing
// rapid duplicates within a window.
const MAX_DETECTION_WINDOW_MS = 2 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 90_000;
const SNAPSHOT_INTERVAL_MS = 120_000;

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

// ── shared loaders ──────────────────────────────────────────────────────────

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

async function loadNormalizedPgcr(db: Db, instanceId: string): Promise<NormalizedPvEPgcr | null> {
  const { data } = await db.from("pgcr_cache").select("normalized_pgcr").eq("instance_id", instanceId).maybeSingle();
  return data?.normalized_pgcr ?? null;
}

// ── handlers ────────────────────────────────────────────────────────────────

/** Poll the owner's equipped weapons mid-run and record an off-loadout signal. */
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

  // Keep sampling until the run leaves an active state or ages out.
  const active = ["applied", "in_activity"].includes(run.status);
  if (active && withinWindow(run.started_at)) {
    await enqueueJob(
      { jobType: "capture_equipment_snapshot", runId: p.runId, payload: p, runAt: new Date(Date.now() + SNAPSHOT_INTERVAL_MS).toISOString(), dedupeKey: `capture:${p.runId}:${bucket(SNAPSHOT_INTERVAL_MS)}` },
      db,
    );
  }
}

/** Find the run's completed activity instance and kick off PGCR fetch. */
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
    // Not finished yet — reschedule until the run leaves an active state or ages out.
    if (["applied", "in_activity"].includes(run.status) && withinWindow(run.started_at)) {
      await enqueueJob(
        { jobType: "poll_activity_history", runId: p.runId, payload: p, runAt: new Date(Date.now() + POLL_INTERVAL_MS).toISOString(), dedupeKey: `poll:${p.runId}:${bucket(POLL_INTERVAL_MS)}` },
        db,
      );
    }
    return;
  }

  await db.from("challenge_runs").update({
    pgcr_instance_id: match.activityDetails.instanceId,
    status: "completed_pending_pgcr",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", p.runId);

  await enqueueJob({ jobType: "fetch_pgcr", runId: p.runId, payload: { runId: p.runId, instanceId: match.activityDetails.instanceId } }, db);
}

/** Fetch and cache the raw PGCR, then hand off to parsing. */
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

/** Normalize the cached PGCR and fan out to scoring + compliance. */
export async function parsePgcrHandler(job: WorkerJobRow, d: DetectionDeps = {}) {
  const { db } = deps(d);
  const p = job.payload as { runId: string; instanceId: string };
  const { data: cache } = await db.from("pgcr_cache").select("raw_pgcr").eq("instance_id", p.instanceId).maybeSingle();
  if (!cache?.raw_pgcr) throw new Error(`pgcr ${p.instanceId} not cached`);

  const normalized = parsePvEPgcr(cache.raw_pgcr);
  await db.from("pgcr_cache").update({ normalized_pgcr: normalized, status: "normalized", updated_at: new Date().toISOString() }).eq("instance_id", p.instanceId);

  const run = await loadRun(db, p.runId);
  if (!run) return;
  await db.from("challenge_runs").update({ status: "parsed", updated_at: new Date().toISOString() }).eq("id", p.runId);
  const owner = await loadOwner(db, run);
  const membershipId = owner?.bungie_membership_id;
  if (!membershipId) return;

  await enqueueJob({ jobType: "compute_score", runId: p.runId, payload: { runId: p.runId, playerMembershipId: membershipId } }, db);
  await enqueueJob({ jobType: "compute_compliance", runId: p.runId, payload: { runId: p.runId, playerMembershipId: membershipId } }, db);
}

/** Score the run from its parsed PGCR and trigger the finalize handlers. */
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

  const result = scoreAttackRun({ pgcr, playerMembershipId: p.playerMembershipId, rolledWeaponHashes });

  await db.from("challenge_runs").update({
    score: result.totalScore,
    scoring_breakdown: result.breakdown,
    status: "scored",
    updated_at: new Date().toISOString(),
  }).eq("id", p.runId);

  await enqueueJob({ jobType: "update_leaderboard", runId: p.runId, payload: { runId: p.runId } }, db);
  await enqueueJob({ jobType: "award_badges", runId: p.runId, payload: { runId: p.runId } }, db);

  // Refresh the player's Your Season aggregates (idempotent recompute).
  await syncPlayerStats({ userId: run.created_by, seasonId: run.season_id ?? null }, db);
}

/** Evaluate leaderboard eligibility from PGCR usage + equipment snapshots. */
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

  const eligibility = computeRunEligibility({ player, expectedWeapons: expected, snapshots });

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
