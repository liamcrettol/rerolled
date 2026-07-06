export const SCORE_ATTACK_JOB_TYPES = [
  "capture_equipment_snapshot",
  "capture_trials_passage_snapshot",
  "poll_activity_history",
  "fetch_pgcr",
  "parse_pgcr",
  "compute_score",
  "compute_compliance",
  "compute_legality",
  "update_leaderboard",
  "award_badges",
  "expire_run",
] as const;

export type ScoreAttackJobType = (typeof SCORE_ATTACK_JOB_TYPES)[number];

export interface ScoreAttackJobPayloadMap {
  capture_equipment_snapshot: {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
  };
  capture_trials_passage_snapshot: {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
    capturePhase: "pre_match" | "post_match";
  };
  poll_activity_history: {
    runId: string;
    membershipId: string;
    membershipType: number;
    characterId: string;
    appliedAt?: string;
  };
  fetch_pgcr: {
    runId: string;
    instanceId: string;
  };
  parse_pgcr: {
    runId: string;
    instanceId: string;
  };
  compute_score: {
    runId: string;
    playerMembershipId: string;
  };
  compute_compliance: {
    runId: string;
    playerMembershipId: string;
  };
  compute_legality: {
    runId: string;
  };
  update_leaderboard: {
    runId: string;
  };
  award_badges: {
    runId: string;
  };
  expire_run: {
    runId: string;
  };
}

export type ScoreAttackJobStatus = "pending" | "running" | "completed" | "failed";

export interface ScoreAttackJob<T extends ScoreAttackJobType = ScoreAttackJobType> {
  id: string;
  type: T;
  runId: string;
  payload: ScoreAttackJobPayloadMap[T];
  status: ScoreAttackJobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  dedupeKey: string;
  lastError?: string;
}

export type ScoreAttackJobInput<T extends ScoreAttackJobType = ScoreAttackJobType> = {
  type: T;
  runId: string;
  payload: ScoreAttackJobPayloadMap[T];
  id?: string;
  runAt?: string;
  maxAttempts?: number;
  dedupeKey?: string;
};

export interface EnqueueResult<T extends ScoreAttackJobType = ScoreAttackJobType> {
  job: ScoreAttackJob<T>;
  created: boolean;
}

export interface ScoreAttackJobQueue {
  enqueue<T extends ScoreAttackJobType>(input: ScoreAttackJobInput<T>): EnqueueResult<T>;
  reserve(now?: Date): ScoreAttackJob | null;
  complete(jobId: string): ScoreAttackJob | null;
  fail(jobId: string, error: unknown, now?: Date, backoffMs?: number): ScoreAttackJob | null;
  get(jobId: string): ScoreAttackJob | null;
  all(): ScoreAttackJob[];
}

export type ScoreAttackJobHandler<T extends ScoreAttackJobType = ScoreAttackJobType> = (
  job: ScoreAttackJob<T>
) => Promise<void> | void;

export type ScoreAttackJobHandlers = {
  [K in ScoreAttackJobType]?: ScoreAttackJobHandler<K>;
};

export interface RunNextJobResult {
  job: ScoreAttackJob | null;
  status: "idle" | "completed" | "failed";
  error?: unknown;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 30_000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function createScoreAttackJobId(input: Pick<ScoreAttackJobInput, "type" | "runId" | "payload">): string {
  return `${input.type}:${input.runId}:${stableStringify(input.payload)}`;
}

export function createScoreAttackDedupeKey(input: Pick<ScoreAttackJobInput, "type" | "runId" | "payload">): string {
  return createScoreAttackJobId(input);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class InMemoryScoreAttackJobQueue implements ScoreAttackJobQueue {
  private jobs = new Map<string, ScoreAttackJob>();
  private dedupeKeys = new Map<string, string>();

  enqueue<T extends ScoreAttackJobType>(input: ScoreAttackJobInput<T>): EnqueueResult<T> {
    const dedupeKey = input.dedupeKey ?? createScoreAttackDedupeKey(input);
    const existingId = this.dedupeKeys.get(dedupeKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing && existing.status !== "failed") {
        return { job: existing as ScoreAttackJob<T>, created: false };
      }
    }

    const id = input.id ?? createScoreAttackJobId(input);
    const job: ScoreAttackJob<T> = {
      id,
      type: input.type,
      runId: input.runId,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      runAt: input.runAt ?? new Date(0).toISOString(),
      dedupeKey,
    };

    this.jobs.set(id, job);
    this.dedupeKeys.set(dedupeKey, id);
    return { job, created: true };
  }

  reserve(now: Date = new Date()): ScoreAttackJob | null {
    const nowMs = now.getTime();
    const due = [...this.jobs.values()]
      .filter((job) => job.status === "pending" && new Date(job.runAt).getTime() <= nowMs)
      .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime())[0];

    if (!due) return null;
    due.status = "running";
    due.attempts += 1;
    return due;
  }

  complete(jobId: string): ScoreAttackJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.status = "completed";
    return job;
  }

  fail(
    jobId: string,
    error: unknown,
    now: Date = new Date(),
    backoffMs: number = DEFAULT_RETRY_BACKOFF_MS,
  ): ScoreAttackJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.lastError = toErrorMessage(error);
    if (job.attempts >= job.maxAttempts) {
      job.status = "failed";
      return job;
    }

    job.status = "pending";
    job.runAt = new Date(now.getTime() + backoffMs).toISOString();
    return job;
  }

  get(jobId: string): ScoreAttackJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  all(): ScoreAttackJob[] {
    return [...this.jobs.values()];
  }
}

export async function runNextScoreAttackJob(
  queue: ScoreAttackJobQueue,
  handlers: ScoreAttackJobHandlers,
  now: Date = new Date(),
  retryBackoffMs: number = DEFAULT_RETRY_BACKOFF_MS,
): Promise<RunNextJobResult> {
  const job = queue.reserve(now);
  if (!job) return { job: null, status: "idle" };

  const handler = handlers[job.type] as ScoreAttackJobHandler | undefined;
  if (!handler) {
    const failed = queue.fail(job.id, new Error(`No handler registered for ${job.type}`), now, retryBackoffMs);
    return { job: failed, status: "failed", error: failed?.lastError };
  }

  try {
    await handler(job);
    return { job: queue.complete(job.id), status: "completed" };
  } catch (error) {
    return {
      job: queue.fail(job.id, error, now, retryBackoffMs),
      status: "failed",
      error,
    };
  }
}
