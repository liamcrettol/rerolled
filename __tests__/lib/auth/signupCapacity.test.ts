/** @jest-environment node */

const mockRpc = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  withSupabaseTimeout: (promise: unknown) => promise,
}));

import { reserveSignupSlot, releaseSignupSlot, findExistingRivalAccountIds } from "@/lib/auth/signupCapacity";

describe("reserveSignupSlot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an available result", async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, already_registered: false, user_count: 8, max_users: 150 }],
      error: null,
    });

    await expect(reserveSignupSlot("user-1", "rerolled")).resolves.toEqual({
      allowed: true,
      already_registered: false,
      user_count: 8,
      max_users: 150,
      status: "available",
    });
    expect(mockRpc).toHaveBeenCalledWith("reserve_signup_slot", { p_user_id: "user-1", p_site: "rerolled" });
  });

  it("retries once on an RPC error, then throws", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "db unavailable" } });

    await expect(reserveSignupSlot("user-1", "rerolled")).rejects.toThrow("db unavailable");
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});

describe("releaseSignupSlot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls the release RPC with the orphaned user id", async () => {
    mockRpc.mockResolvedValue({ data: [{ released: true, user_count: 7, max_users: 150 }], error: null });

    await releaseSignupSlot("orphaned-user", "rerolled");

    expect(mockRpc).toHaveBeenCalledWith("release_signup_slot", { p_user_id: "orphaned-user" });
  });

  it("never throws, even when the RPC fails", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: "db unavailable" } });

    await expect(releaseSignupSlot("orphaned-user", "rerolled")).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      "[signupCapacity] failed to release an orphaned slot",
      expect.objectContaining({ userId: "orphaned-user" }),
    );
    errSpy.mockRestore();
  });
});

describe("findExistingRivalAccountIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RIVAL_SYNC_SECRET = "shared-secret";
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it("returns the existing ids Rival reports", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ existingUserIds: ["user-1"] }),
    });

    await expect(findExistingRivalAccountIds(["user-1", "user-2"])).resolves.toEqual(["user-1"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://rival.rerolled.io/api/internal/rerolled/account-exists",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userIds: ["user-1", "user-2"] }),
      }),
    );
  });

  it("returns null (never an empty array) on a non-2xx response, so nothing gets wrongly released", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503, json: async () => null });

    await expect(findExistingRivalAccountIds(["user-1"])).resolves.toBeNull();
    errSpy.mockRestore();
  });

  it("returns null when RIVAL_SYNC_SECRET is not configured", async () => {
    delete process.env.RIVAL_SYNC_SECRET;
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(findExistingRivalAccountIds(["user-1"])).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns null on a network error", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    await expect(findExistingRivalAccountIds(["user-1"])).resolves.toBeNull();
    errSpy.mockRestore();
  });

  it("returns null on a malformed response body", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ nope: true }) });

    await expect(findExistingRivalAccountIds(["user-1"])).resolves.toBeNull();
    errSpy.mockRestore();
  });
});
