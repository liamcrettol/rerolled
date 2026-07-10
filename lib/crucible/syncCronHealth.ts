export interface CrucibleSyncRunResult {
  claimed: number;
  completed: number;
  failed: number;
  activities: number;
  matches: number;
}

export type CrucibleSyncHealthState =
  | "idle"
  | "progress"
  | "stalled"
  | "partial_failure"
  | "failed";

export interface CrucibleSyncHealth {
  ok: boolean;
  state: CrucibleSyncHealthState;
  httpStatus: number;
  message: string;
}

export function evaluateCrucibleSyncHealth(
  result: CrucibleSyncRunResult,
  queuedBefore: number,
): CrucibleSyncHealth {
  if (queuedBefore > 0 && result.claimed === 0) {
    return {
      ok: false,
      state: "stalled",
      httpStatus: 503,
      message: `${queuedBefore} due Crucible sync ${queuedBefore === 1 ? "job was" : "jobs were"} queued, but none could be claimed.`,
    };
  }

  if (result.failed > 0) {
    const partial = result.completed > 0;
    return {
      ok: false,
      state: partial ? "partial_failure" : "failed",
      httpStatus: 500,
      message: partial
        ? `${result.completed} Crucible sync page${result.completed === 1 ? "" : "s"} completed and ${result.failed} failed.`
        : `All ${result.failed} claimed Crucible sync ${result.failed === 1 ? "job" : "jobs"} failed.`,
    };
  }

  if (result.claimed === 0) {
    return {
      ok: true,
      state: "idle",
      httpStatus: 200,
      message: "No due Crucible history work was queued.",
    };
  }

  return {
    ok: true,
    state: "progress",
    httpStatus: 200,
    message: `${result.completed} Crucible sync page${result.completed === 1 ? "" : "s"} completed successfully.`,
  };
}
