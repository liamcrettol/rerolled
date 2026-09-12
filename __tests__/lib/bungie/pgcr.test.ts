/** @jest-environment node */
// getPGCR reads/writes the pgcr_cache table through the admin client; stub it
// out so tests exercise only the fetch classification logic.
jest.mock("@/lib/supabase/admin", () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null }),
    upsert: async () => ({ error: null }),
  };
  return { adminSupabase: { from: () => builder } };
});

import { getPGCR, getActivityHistory, TransientPgcrError } from "@/lib/bungie/pgcr";

function mockFetchResponse(status: number, body?: unknown, headers: Record<string, string> = {}) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  })) as unknown as typeof fetch;
}

const ok = (payload: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ ErrorCode: 1, Response: payload }),
});

const failing = (status: number, body: Record<string, unknown> = {}) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => body,
});

// getActivityHistory retries through bungieGet's backoff sleep. Drive those
// sleeps without waiting on real timers (mirrors __tests__/lib/bungie/clientRetry.test.ts).
async function runAll<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const settled = promise.then(
    (v) => { done = true; return { ok: true as const, v }; },
    (e) => { done = true; return { ok: false as const, e }; }
  );

  for (let i = 0; i < 50 && !done; i++) {
    for (let j = 0; j < 5; j++) await Promise.resolve();
    jest.runOnlyPendingTimers();
  }

  const r = await settled;
  if (r.ok) return r.v;
  throw r.e;
}

describe("getPGCR transient failure classification", () => {
  beforeEach(() => {
    process.env.BUNGIE_API_KEY = "test-key";
  });

  it("throws TransientPgcrError on 429 when throwOnTransient is set", async () => {
    mockFetchResponse(429, undefined, { "retry-after": "5" });
    await expect(getPGCR("111", { throwOnTransient: true })).rejects.toThrow(TransientPgcrError);
  });

  it("throws TransientPgcrError on 5xx when throwOnTransient is set", async () => {
    mockFetchResponse(503);
    await expect(getPGCR("111", { throwOnTransient: true })).rejects.toThrow(TransientPgcrError);
  });

  it("returns null on 429 without the option (legacy lenient behavior)", async () => {
    mockFetchResponse(429);
    await expect(getPGCR("111")).resolves.toBeNull();
  });

  it("returns null on 404 even with throwOnTransient (permanently missing)", async () => {
    mockFetchResponse(404);
    await expect(getPGCR("111", { throwOnTransient: true })).resolves.toBeNull();
  });

  it("throws on a transient Bungie error envelope even when HTTP is 200", async () => {
    mockFetchResponse(200, {
      ErrorCode: 36,
      ErrorStatus: "ThrottleLimitExceededMinutes",
      Message: "Slow down",
      ThrottleSeconds: 60,
    });
    await expect(getPGCR("111", { throwOnTransient: true })).rejects.toThrow(TransientPgcrError);
  });

  it("keeps a PGCR-not-found envelope as a permanent miss", async () => {
    mockFetchResponse(200, { ErrorCode: 1653, ErrorStatus: "DestinyPGCRNotFound" });
    await expect(getPGCR("111", { throwOnTransient: true })).resolves.toBeNull();
  });

  it("returns the report on success", async () => {
    const pgcr = { period: "2026-07-10T00:00:00Z", activityDetails: { instanceId: "111" }, entries: [] };
    mockFetchResponse(200, { ErrorCode: 1, Response: pgcr });
    await expect(getPGCR("111", { throwOnTransient: true })).resolves.toEqual(pgcr);
  });
});

// Bug: a bare fetch in getActivityHistory treated a 429/5xx the exact same way
// as "this player genuinely has no activity history yet" (`if (!res.ok) return
// []`), which is indistinguishable from real emptiness to collectPostMatchStats
// and silently, permanently drops the match once it falls outside the 3-hour
// detection window (lib/lobby/index.ts). Fixed by routing through bungieGet's
// retry/backoff instead of a bare fetch.
describe("getActivityHistory transient failure handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    process.env.BUNGIE_API_KEY = "test-key";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retries a 429 instead of giving up on the first attempt", async () => {
    const activities = [{ activityDetails: { instanceId: "1", referenceId: 2 }, period: "2026-01-01T00:00:00Z" }];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(failing(429, { ThrottleSeconds: 0 }))
      .mockResolvedValueOnce(ok({ activities }));

    await expect(runAll(getActivityHistory(3, "mid", "cid", "tok"))).resolves.toEqual(activities);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws instead of silently returning [] once retries are exhausted", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(failing(429));

    await expect(runAll(getActivityHistory(3, "mid", "cid", "tok"))).rejects.toThrow();
  });
});
