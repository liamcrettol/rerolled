import { evaluateCrucibleSyncHealth } from "@/lib/crucible/syncCronHealth";

const run = (overrides: Partial<Parameters<typeof evaluateCrucibleSyncHealth>[0]> = {}) => ({
  claimed: 0,
  completed: 0,
  failed: 0,
  activities: 0,
  matches: 0,
  ...overrides,
});

describe("evaluateCrucibleSyncHealth", () => {
  it("reports a stalled worker when due jobs exist but none can be claimed", () => {
    expect(evaluateCrucibleSyncHealth(run(), 2)).toEqual({
      ok: false,
      state: "stalled",
      httpStatus: 503,
      message: "2 due Crucible sync jobs were queued, but none could be claimed.",
    });
  });

  it("fails visibly when every claimed page fails", () => {
    expect(evaluateCrucibleSyncHealth(run({ claimed: 1, failed: 1 }), 1)).toEqual({
      ok: false,
      state: "failed",
      httpStatus: 500,
      message: "All 1 claimed Crucible sync job failed.",
    });
  });

  it("reports partial failure when some pages finish and another fails", () => {
    expect(evaluateCrucibleSyncHealth(run({ claimed: 3, completed: 2, failed: 1 }), 1)).toEqual({
      ok: false,
      state: "partial_failure",
      httpStatus: 500,
      message: "2 Crucible sync pages completed and 1 failed.",
    });
  });

  it("reports progress for a successful import run", () => {
    expect(evaluateCrucibleSyncHealth(run({ claimed: 3, completed: 3, matches: 150 }), 1)).toEqual({
      ok: true,
      state: "progress",
      httpStatus: 200,
      message: "3 Crucible sync pages completed successfully.",
    });
  });

  it("keeps an empty queue green", () => {
    expect(evaluateCrucibleSyncHealth(run(), 0)).toEqual({
      ok: true,
      state: "idle",
      httpStatus: 200,
      message: "No due Crucible history work was queued.",
    });
  });
});
