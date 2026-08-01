/** @jest-environment node */

const mockRpc = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  withSupabaseTimeout: (promise: unknown) => promise,
}));

import { reserveSignupSlot, releaseSignupSlot } from "@/lib/auth/signupCapacity";

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
