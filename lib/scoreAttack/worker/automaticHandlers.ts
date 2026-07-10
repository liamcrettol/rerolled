import { buildPlayerBadgeInsert, evaluateBadges } from "@/lib/badges/evaluators";
import { evaluateRerolledBadge } from "@/lib/badges/rerolledEvaluators";
import type { ChallengeRun } from "@/types/challenges";
import {
  getHandler as getBaseHandler,
  updateLeaderboardHandler,
  type JobHandler,
} from "./handlers";
import type { ScoreAttackJobType } from "./jobs";
import {
  buildParticipantBadgeContext,
  finalizationPrerequisitesReady,
  loadAllBadges,
  loadComplianceResult,
  loadLeaderboardEntry,
  loadLoadoutSlots,
  loadNormalizedPgcr,
  loadParticipants,
  loadRun,
  loadSeasonStreak,
  type BadgeDb,
} from "./participantBadgeContext";
import {
  captureParticipantEquipmentHandler,
  captureParticipantTrialsHandler,
  parsePgcrAndFanOutTrialsHandler,
} from "./participantSnapshots";

export {
  detectMercyOrLargeMargin,
  finalizationPrerequisitesReady,
} from "./participantBadgeContext";

const NO_AWARD_STATES = new Set(["failed", "abandoned", "expired"]);

async function ensureRunFinalized(db: BadgeDb, runId: string): Promise<ChallengeRun | null> {
  const run = await loadRun(db, runId);
  if (!run || NO_AWARD_STATES.has(run.status)) return null;
  if (run.status === "finalized") return run;

  const [participants, legalityResult] = await Promise.all([
    loadParticipants(db, runId),
    db.from("run_legality_results").select("user_id").eq("run_id", runId),
  ]);
  const legalityRows = legalityResult.data ?? [];
  if (
    !finalizationPrerequisitesReady(
      run,
      participants.map((participant) => participant.user_id),
      legalityRows.map((row: { user_id: string | null }) => row.user_id),
    )
  ) {
    throw new Error(`run ${runId} prerequisites pending before finalization`);
  }

  const finalizedAt = new Date().toISOString();
  const { error } = await db
    .from("challenge_runs")
    .update({ status: "finalized", finalized_at: finalizedAt, updated_at: finalizedAt })
    .eq("id", runId);
  if (error) throw new Error(`failed to finalize run ${runId}: ${error.message}`);

  try {
    await db.from("challenge_run_events").insert({
      run_id: runId,
      event_type: "automatic_finalization",
      payload: { participant_count: participants.length },
    });
  } catch {
    // Audit events are best effort.
  }

  return { ...run, status: "finalized", finalized_at: finalizedAt, updated_at: finalizedAt };
}

export const finalizedLeaderboardHandler: JobHandler = async (job, db) => {
  if (!job.run_id) return;
  const run = await ensureRunFinalized(db, job.run_id);
  if (!run) return;
  await updateLeaderboardHandler(job, db);
};

export const awardAllParticipantBadgesHandler: JobHandler = async (job, db) => {
  if (!job.run_id) return;
  const run = await ensureRunFinalized(db, job.run_id);
  if (!run) return;

  // Top-10 placement is an input to one legacy badge. Performing the idempotent
  // leaderboard upsert here removes ordering dependence between concurrent jobs.
  await updateLeaderboardHandler(job, db);

  const [participants, slots, badges, pgcr] = await Promise.all([
    loadParticipants(db, run.id),
    loadLoadoutSlots(db, run.id),
    loadAllBadges(db),
    loadNormalizedPgcr(db, run.pgcr_instance_id),
  ]);
  const rerolledBadges = badges.filter((badge) => badge.mode !== null);
  const inserts: Array<ReturnType<typeof buildPlayerBadgeInsert>> = [];

  for (const participant of participants) {
    const [leaderboardEntry, currentStreak, complianceResult, context] = await Promise.all([
      loadLeaderboardEntry(db, run, participant.user_id),
      loadSeasonStreak(db, run, participant.user_id),
      loadComplianceResult(db, run.id, participant.user_id),
      buildParticipantBadgeContext(db, run, participant, slots, pgcr),
    ]);

    const legacyResults = evaluateBadges({
      run,
      loadoutSlots: slots,
      complianceResult,
      leaderboardEntry,
      currentStreak,
    });
    const legacyIds = new Map(
      badges
        .filter((badge) => legacyResults.some((result) => result.slug === badge.slug))
        .map((badge) => [badge.slug, badge.id]),
    );

    for (const result of legacyResults) {
      const badgeId = legacyIds.get(result.slug);
      if (!badgeId) continue;
      inserts.push(
        buildPlayerBadgeInsert(
          participant.user_id,
          participant.bungie_membership_id,
          badgeId,
          result.decision,
          {
            runId: run.id,
            weeklyChallengeId: run.weekly_challenge_id,
            seasonId: run.season_id,
          },
        ),
      );
    }

    for (const badge of rerolledBadges) {
      if (badge.criteria.rule === "manual_grant") continue;
      try {
        const decision = evaluateRerolledBadge(badge.criteria, context);
        if (!decision.awarded) continue;
        inserts.push(
          buildPlayerBadgeInsert(
            participant.user_id,
            participant.bungie_membership_id,
            badge.id,
            decision,
            {
              runId: run.id,
              weeklyChallengeId: run.weekly_challenge_id,
              seasonId: run.season_id,
            },
          ),
        );
      } catch (error) {
        console.warn(
          `[worker] badge evaluation failed for ${badge.slug}, user ${participant.user_id}, run ${run.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  if (inserts.length) {
    const { error } = await db
      .from("player_badges")
      .upsert(inserts, { onConflict: "user_id,badge_id,scope_key", ignoreDuplicates: true });
    if (error) throw new Error(`failed to persist badges for run ${run.id}: ${error.message}`);
  }
};

const automaticHandlers: Partial<Record<ScoreAttackJobType, JobHandler>> = {
  capture_equipment_snapshot: captureParticipantEquipmentHandler,
  capture_trials_passage_snapshot: captureParticipantTrialsHandler,
  parse_pgcr: parsePgcrAndFanOutTrialsHandler,
  update_leaderboard: finalizedLeaderboardHandler,
  award_badges: awardAllParticipantBadgesHandler,
};

export function getAutomaticHandler(jobType: ScoreAttackJobType): JobHandler | undefined {
  return automaticHandlers[jobType] ?? getBaseHandler(jobType);
}
