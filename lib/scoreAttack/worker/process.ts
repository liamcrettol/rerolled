// Worker drain loop (#255).
//
// Claims due jobs one at a time (atomic FOR UPDATE SKIP LOCKED via the RPC),
// dispatches to the registered handler, and marks completed/failed. Bounded by
// maxJobs so a single cron invocation returns promptly. Unregistered job types
// complete as a no-op so unimplemented pipeline stages never churn retries.

import { claimNextJob, completeJob, failJob, type WorkerJobRow } from "./store";
import { getHandler } from "./handlers";
import { adminSupabase } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ProcessResult {
  processed: number;
  completed: number;
  failed: number;
  noHandler: number;
}

export async function processWorkerJobs(
  opts: { maxJobs?: number; workerId?: string; lockSeconds?: number; db?: Db } = {},
): Promise<ProcessResult> {
  const maxJobs = opts.maxJobs ?? 25;
  const workerId = opts.workerId ?? `cron-${Math.random().toString(36).slice(2, 8)}`;
  const lockSeconds = opts.lockSeconds ?? 60;
  const db: Db = opts.db ?? adminSupabase;

  const result: ProcessResult = { processed: 0, completed: 0, failed: 0, noHandler: 0 };

  for (let i = 0; i < maxJobs; i++) {
    const job: WorkerJobRow | null = await claimNextJob(workerId, lockSeconds, db);
    if (!job) break; // queue drained
    result.processed++;

    const handler = getHandler(job.job_type);
    if (!handler) {
      // No handler yet (e.g. Bungie-detection stage) — don't retry forever.
      console.warn(`[worker] no handler for job_type=${job.job_type} (job ${job.id}); completing as no-op`);
      result.noHandler++;
      await completeJob(job.id, db);
      continue;
    }

    try {
      await handler(job, db);
      await completeJob(job.id, db);
      result.completed++;
    } catch (err) {
      console.error(`[worker] job ${job.id} (${job.job_type}) failed:`, err instanceof Error ? err.message : err);
      // Linear backoff; the RPC gives up after max_attempts.
      const nextRunAt = new Date(Date.now() + 30_000).toISOString();
      await failJob(job.id, err, nextRunAt, db);
      result.failed++;
    }
  }

  return result;
}
