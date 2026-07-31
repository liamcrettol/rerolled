/** @jest-environment node */
import { NextRequest } from "next/server";

const mockReserveSignupSlot = jest.fn();
const mockReleaseSignupSlot = jest.fn();
jest.mock("@/lib/auth/signupCapacity", () => ({
  reserveSignupSlot: (...args: unknown[]) => mockReserveSignupSlot(...args),
  releaseSignupSlot: (...args: unknown[]) => mockReleaseSignupSlot(...args),
}));

import { DELETE, POST } from "@/app/api/internal/rival/signup-capacity/route";

function request(method: string, body: unknown, authorization = "Bearer secret") {
  return new NextRequest("https://rerolled.io/api/internal/rival/signup-capacity", {
    method,
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  process.env.RIVAL_SYNC_SECRET = "secret";
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/internal/rival/signup-capacity", () => {
  it("rejects an unauthorized request", async () => {
    const res = await POST(request("POST", { userId: "u1" }, "Bearer wrong"));
    expect(res.status).toBe(401);
    expect(mockReserveSignupSlot).not.toHaveBeenCalled();
  });

  it("reserves a slot for an authorized request", async () => {
    mockReserveSignupSlot.mockResolvedValue({
      status: "available",
      allowed: true,
      already_registered: false,
      user_count: 8,
      max_users: 150,
    });
    const res = await POST(request("POST", { userId: "u1" }));
    expect(res.status).toBe(200);
    expect(mockReserveSignupSlot).toHaveBeenCalledWith("u1", "rival");
  });
});

describe("DELETE /api/internal/rival/signup-capacity", () => {
  it("rejects an unauthorized request", async () => {
    const res = await DELETE(request("DELETE", { userId: "u1" }, "Bearer wrong"));
    expect(res.status).toBe(401);
    expect(mockReleaseSignupSlot).not.toHaveBeenCalled();
  });

  it("rejects a request missing userId", async () => {
    const res = await DELETE(request("DELETE", {}));
    expect(res.status).toBe(400);
    expect(mockReleaseSignupSlot).not.toHaveBeenCalled();
  });

  it("releases the slot for an authorized request", async () => {
    mockReleaseSignupSlot.mockResolvedValue(undefined);
    const res = await DELETE(request("DELETE", { userId: "abandoned-user" }));
    expect(res.status).toBe(200);
    expect(mockReleaseSignupSlot).toHaveBeenCalledWith("abandoned-user");
  });
});
