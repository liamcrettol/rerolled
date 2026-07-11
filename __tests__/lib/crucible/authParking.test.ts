/** @jest-environment node */
// Auth failures (dead or cross-app refresh token) are deterministic: retrying
// never fixes them, only the user signing in again. failCrucibleSync must park
// such users immediately, and queueCrucibleSync must not revive them from a
// mere page view.
jest.mock("@/lib/auth/helpers", () => ({ getBungieToken: jest.fn() }));

import { failCrucibleSync } from "@/lib/crucible/sync";
import { queueCrucibleSync } from "@/lib/crucible/queueSync";

const AUTH_ERROR =
  'Bungie token refresh failed (400): {"error":"invalid_request","error_description":"ProvidedTokenNotValidRefreshToken"}. Please sign out and sign in again';

function makeSyncDb(attempts: number) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: { attempts } }),
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
      return builder;
    },
  };
}

function makeQueueDb(existing: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: existing, error: null }),
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          const chain = {
            eq: () => chain,
            select: () => chain,
            single: async () => ({ data: { ...existing, ...patch }, error: null }),
          };
          return chain;
        },
      };
      return builder;
    },
  };
}

describe("failCrucibleSync auth parking", () => {
  it("parks an auth failure immediately, before the retry budget is spent", async () => {
    const db = makeSyncDb(1);
    const outcome = await failCrucibleSync("user-1", new Error(AUTH_ERROR), db);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].status).toBe("failed");
    expect(outcome.terminal).toBe(true);
  });

  it("still retries transient failures with backoff", async () => {
    const db = makeSyncDb(1);
    const outcome = await failCrucibleSync("user-1", new Error("Bungie request failed (503)"), db);
    expect(db.updates[0].status).toBe("queued");
    expect(outcome.terminal).toBe(false);
  });

  it("parks a user terminally once the retry budget is exhausted", async () => {
    const db = makeSyncDb(5);
    const outcome = await failCrucibleSync("user-1", new Error("Bungie request failed (503)"), db);
    expect(db.updates[0].status).toBe("failed");
    expect(outcome.terminal).toBe(true);
  });
});

describe("queueCrucibleSync auth-parked users", () => {
  const parked = {
    user_id: "user-1",
    status: "failed",
    last_error: AUTH_ERROR,
    last_incremental_sync_at: null,
    backfill_completed_at: null,
  };

  it("does not revive an auth-parked user from a page view", async () => {
    const db = makeQueueDb(parked);
    const state = await queueCrucibleSync("user-1", db);
    expect(state?.status).toBe("failed");
    expect(db.updates).toHaveLength(0);
  });

  it("revives an auth-parked user on a fresh sign-in", async () => {
    const db = makeQueueDb(parked);
    await queueCrucibleSync("user-1", db, { fromSignIn: true });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].status).toBe("queued");
  });

  it("still re-queues non-auth failures from a page view", async () => {
    const db = makeQueueDb({ ...parked, last_error: "Sync cursor save failed: timeout" });
    await queueCrucibleSync("user-1", db);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].status).toBe("queued");
  });
});
