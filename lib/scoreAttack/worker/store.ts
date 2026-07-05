// Postgres-backed worker job store (#255).
//
// The atomic claim/complete/fail with FOR UPDATE SKIP LOCKED lives in SQL
// (migration 028: claim_next_worker_job / complete_worker_job / fail_worker_job).
// This is the thin app-side wrapper: enqueue (deduped) + the RPC calls, so the
// cron runner can drain the queue safely across concurrent invocations.

import { adminSupabase } from "@/lib/supabase/admin";
import type { ScoreAttackJobType, ScoreAttackJobPayloadMap } from "./jobs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface EnqueueJobInput<T extends ScoreAttackJobType = ScoreAttackJobType> {
  jobType: T;
  runId: string;
  payload: ScoreAttackJobPayloadMap[T];
  /** Defaults to type:runId:payload so identical jobs collapse to one row. */
  dedupeKey?: string;
  /** ISO timestamp; defaults to now (run immediately). */
  runAt?: string;
  maxAttempts?: number;
}

export interface WorkerJobRow {
  id: string;
  job_type: ScoreAttackJobType;
  run_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  status: string;
  attempts: number;
  max_attempts: number;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}

/** Enqueue a job, collapsing duplicates on dedupe_key (no-op if one exists). */
export async function enqueueJob<T extends ScoreAttackJobType>(
  input: EnqueueJobInput<T>,
  db: Db = adminSupabase,
): Promise<void> {
  const dedupeKey =
    input.dedupeKey ?? `${input.jobType}:${input.runId}:${stableStringify(input.payload)}`;

  await db.from("worker_jobs").upsert(
    {
      job_type: input.jobType,
      run_id: input.runId,
      payload: input.payload,
      status: "pending",
      dedupe_key: dedupeKey,
      run_at: input.runAt ?? new Date().toISOString(),
      max_attempts: input.maxAttempts ?? 3,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
}

/** Atomically claim the next due job for this worker, or null if none. */
export async function claimNextJob(
  workerId: string,
  lockSeconds = 60,
  db: Db = adminSupabase,
): Promise<WorkerJobRow | null> {
  const { data, error } = await db.rpc("claim_next_worker_job", {
    p_worker_id: workerId,
    p_lock_seconds: lockSeconds,
  });
  if (error) throw new Error(`claim_next_worker_job failed: ${error.message}`);
  // The RPC returns a worker_jobs row, or an all-null composite when idle.
  const row = Array.isArray(data) ? data[0] : data;
  return row?.id ? (row as WorkerJobRow) : null;
}

export async function completeJob(jobId: string, db: Db = adminSupabase): Promise<void> {
  const { error } = await db.rpc("complete_worker_job", { p_job_id: jobId });
  if (error) throw new Error(`complete_worker_job failed: ${error.message}`);
}

export async function failJob(
  jobId: string,
  error: unknown,
  nextRunAt: string | null = null,
  db: Db = adminSupabase,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const { error: rpcError } = await db.rpc("fail_worker_job", {
    p_job_id: jobId,
    p_error: message.slice(0, 500),
    p_next_run_at: nextRunAt,
  });
  if (rpcError) throw new Error(`fail_worker_job failed: ${rpcError.message}`);
}
