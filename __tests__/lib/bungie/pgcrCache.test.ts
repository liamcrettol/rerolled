/** @jest-environment node */

const maybeSingle = jest.fn();
const upsert = jest.fn();
const from = jest.fn();

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: (...args: unknown[]) => from(...args) },
}));

import { getPGCR } from "@/lib/bungie/pgcr";

function mockDb() {
  from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    upsert,
  }));
}

const PGCR = { activityDetails: { instanceId: "123", referenceId: 9 }, entries: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb();
  process.env.BUNGIE_API_KEY = "test-key";
  global.fetch = jest.fn();
});

describe("getPGCR caching", () => {
  it("returns the cached report without calling Bungie", async () => {
    maybeSingle.mockResolvedValue({ data: { raw_pgcr: PGCR } });

    await expect(getPGCR("123")).resolves.toEqual(PGCR);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches from Bungie on a cache miss and caches the result", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ErrorCode: 1, Response: PGCR }),
    });

    await expect(getPGCR("123")).resolves.toEqual(PGCR);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ instance_id: "123", raw_pgcr: PGCR, status: "fetched" }),
      { onConflict: "instance_id" }
    );
  });

  it("falls back to Bungie when the cache read throws", async () => {
    maybeSingle.mockRejectedValue(new Error("supabase timed out"));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ErrorCode: 1, Response: PGCR }),
    });

    await expect(getPGCR("123")).resolves.toEqual(PGCR);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache a Bungie error response", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ErrorCode: 5, Message: "SystemDisabled" }),
    });

    await expect(getPGCR("123")).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("survives a cache write failure", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    upsert.mockRejectedValue(new Error("write failed"));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ErrorCode: 1, Response: PGCR }),
    });

    await expect(getPGCR("123")).resolves.toEqual(PGCR);
  });
});
