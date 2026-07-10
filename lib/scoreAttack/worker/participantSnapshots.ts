import { getBungieToken } from "@/lib/auth/helpers";
import { BungieWorkerClient } from "@/lib/bungie/workerClient";
import { extractTrialsPassageSnapshots, type TrialsPassageCapturePhase } from "@/lib/scoreAttack/trialsPassages";
import { bucketToSlot, type BungieProfileResponse, type WeaponSlot } from "@/types/bungie";
import { parsePgcrHandler } from "./detection";
import type { JobHandler } from "./handlers";
import { enqueueJob, type WorkerJobRow } from "./store";
import {
  loadLoadoutSlots,
  loadParticipantByMembership,
  loadParticipants,
  loadRun,
  type BadgeDb,
} from "./participantBadgeContext";

const MAX_DETECTION_WINDOW_MS = 2 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 120_000;
const TRIALS_COMPONENTS = [200, 201, 205, 102, 300, 301].join(",");

function withinWindow(startedAt: string | null): boolean {
  return !startedAt || Date.now() - new Date(startedAt).getTime() < MAX_DETECTION_WINDOW_MS;
}

function bucket(intervalMs: number): number {
  return Math.floor(Date.now() / intervalMs);
}

export const captureParticipantEquipmentHandler: JobHandler = async (job, db: BadgeDb) => {
  const payload = job.payload as {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
  };
  const [run, participant] = await Promise.all([
    loadRun(db, payload.runId),
    loadParticipantByMembership(db, payload.runId, payload.membershipId),
  ]);
  if (!run || !participant) return;

  const token = await getBungieToken(participant.user_id, payload.membershipId);
  const client = new BungieWorkerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = await client.get(
    `/Destiny2/${payload.membershipType}/Profile/${payload.membershipId}/?components=205`,
    token,
  );
  const items: Array<{ itemHash: number; bucketHash: number }> =
    profile?.characterEquipment?.data?.[payload.characterId]?.items ?? [];
  const equipped = items
    .map((item) => ({ slot: bucketToSlot(item.bucketHash), weaponHash: item.itemHash }))
    .filter((weapon): weapon is { slot: WeaponSlot; weaponHash: number } => weapon.slot !== null);
  const slots = await loadLoadoutSlots(db, payload.runId);
  const expected = slots.map((slot) => ({
    slot: slot.slot,
    weaponHash: slot.item_hash,
    weaponType: slot.weapon_type ?? undefined,
    optional: slot.is_wildcard,
  }));

  await db.from("run_equipment_snapshots").insert({
    run_id: payload.runId,
    user_id: participant.user_id,
    bungie_membership_id: payload.membershipId,
    bungie_membership_type: payload.membershipType,
    character_id: payload.characterId,
    captured_at: new Date().toISOString(),
    equipped,
    expected,
  });

  if (participant.is_owner) {
    const participants = await loadParticipants(db, payload.runId);
    for (const teammate of participants) {
      if (teammate.is_owner || !teammate.character_id) continue;
      const base = {
        runId: payload.runId,
        membershipId: teammate.bungie_membership_id,
        membershipType: teammate.bungie_membership_type ?? 3,
        characterId: teammate.character_id,
      };
      await enqueueJob(
        {
          jobType: "capture_equipment_snapshot",
          runId: payload.runId,
          payload: base,
          dedupeKey: `capture-initial:${payload.runId}:${teammate.user_id}`,
        },
        db,
      );
      await enqueueJob(
        {
          jobType: "capture_trials_passage_snapshot",
          runId: payload.runId,
          payload: { ...base, capturePhase: "pre_match" },
          dedupeKey: `trials-pre:${payload.runId}:${teammate.user_id}`,
        },
        db,
      );
    }
  }

  if (["applied", "in_activity"].includes(run.status) && withinWindow(run.started_at)) {
    await enqueueJob(
      {
        jobType: "capture_equipment_snapshot",
        runId: payload.runId,
        payload,
        runAt: new Date(Date.now() + SNAPSHOT_INTERVAL_MS).toISOString(),
        dedupeKey: `capture:${payload.runId}:${participant.user_id}:${bucket(SNAPSHOT_INTERVAL_MS)}`,
      },
      db,
    );
  }
};

export const captureParticipantTrialsHandler: JobHandler = async (job, db: BadgeDb) => {
  const payload = job.payload as {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
    capturePhase: TrialsPassageCapturePhase;
  };
  const participant = await loadParticipantByMembership(db, payload.runId, payload.membershipId);
  if (!participant) return;

  const token = await getBungieToken(participant.user_id, payload.membershipId);
  const client = new BungieWorkerClient();
  const profile = await client.get<BungieProfileResponse>(
    `/Destiny2/${payload.membershipType}/Profile/${payload.membershipId}/?components=${TRIALS_COMPONENTS}`,
    token,
  );
  const snapshots = extractTrialsPassageSnapshots(profile);
  if (!snapshots.length) return;

  const capturedAt = new Date().toISOString();
  await db.from("run_trials_passage_snapshots").upsert(
    snapshots.map((snapshot) => ({
      run_id: payload.runId,
      user_id: participant.user_id,
      bungie_membership_id: payload.membershipId,
      capture_phase: payload.capturePhase,
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
};

export const parsePgcrAndFanOutTrialsHandler: JobHandler = async (job: WorkerJobRow, db: BadgeDb) => {
  await parsePgcrHandler(job, { db });
  if (!job.run_id) return;

  const participants = await loadParticipants(db, job.run_id);
  for (const participant of participants) {
    if (!participant.character_id) continue;
    await enqueueJob(
      {
        jobType: "capture_trials_passage_snapshot",
        runId: job.run_id,
        payload: {
          runId: job.run_id,
          membershipId: participant.bungie_membership_id,
          membershipType: participant.bungie_membership_type ?? 3,
          characterId: participant.character_id,
          capturePhase: "post_match",
        },
        dedupeKey: `trials-post:${job.run_id}:${participant.user_id}`,
      },
      db,
    );
  }
};
