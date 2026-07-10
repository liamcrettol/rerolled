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

import { getPGCR, TransientPgcrError } from "@/lib/bungie/pgcr";

function mockFetchResponse(status: number, body?: unknown, headers: Record<string, string> = {}) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  })) as unknown as typeof fetch;
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

  it("returns the report on success", async () => {
    const pgcr = { period: "2026-07-10T00:00:00Z", activityDetails: { instanceId: "111" }, entries: [] };
    mockFetchResponse(200, { ErrorCode: 1, Response: pgcr });
    await expect(getPGCR("111", { throwOnTransient: true })).resolves.toEqual(pgcr);
  });
});
