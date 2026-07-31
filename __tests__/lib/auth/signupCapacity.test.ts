/** @jest-environment node */

const mockRpc = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  withSupabaseTimeout: (promise: Promise<unknown>) => promise,
}));

import { releaseSignupSlot, reserveSignupSlot } from "@/lib/auth/signupCapacity";

describe("reserveSignupSlot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an available result", async () => {
    mockRpc.mockResolvedValue({
      data: { allowed: true, already_registered: false, user_count: 8, max_users: 150 },
      error: null,
    });

    await expect(reserveSignupSlot("new-user", "rerolled")).resolves.toEqual({
      allowed: true,
      already_registered: false,
      user_count: 8,
      max_users: 150,
      status: "available",
    });
    expect(mockRpc).toHaveBeenCalledWith("reserve_signup_slot", { p_user_id: "new-user", p_site: "rerolled" });
  });

  it("surfaces capacity_reached without retrying", async () => {
    mockRpc.mockResolvedValue({
      data: { allowed: false, already_registered: false, user_count: 150, max_users: 150 },
      error: null,
    });

    await expect(reserveSignupSlot("new-user", "rerolled")).resolves.toMatchObject({
      status: "capacity_reached",
      allowed: false,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("retries a transient RPC failure, then succeeds", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: "timeout" } })
      .mockResolvedValueOnce({
        data: { allowed: true, already_registered: false, user_count: 8, max_users: 150 },
        error: null,
      });

    await expect(reserveSignupSlot("new-user", "rerolled")).resolves.toMatchObject({ status: "available" });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed on a malformed RPC response", async () => {
    mockRpc.mockResolvedValue({ data: { allowed: true }, error: null });

    await expect(reserveSignupSlot("new-user", "rerolled")).rejects.toThrow("Signup capacity verification failed");
  });
});

describe("releaseSignupSlot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls the release RPC for the given user", async () => {
    mockRpc.mockResolvedValue({ error: null });

    await releaseSignupSlot("abandoned-user");

    expect(mockRpc).toHaveBeenCalledWith("release_signup_slot", { p_user_id: "abandoned-user" });
  });

  it("never throws, even when the RPC fails", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ error: { message: "boom" } });

    await expect(releaseSignupSlot("abandoned-user")).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      "[signupCapacity] failed to release an abandoned signup slot",
      expect.objectContaining({ userId: "abandoned-user" })
    );
    errSpy.mockRestore();
  });
});
