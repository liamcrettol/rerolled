/** @jest-environment node */
import { POST } from "@/app/api/stats/detect/route";
import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";

const mockFlush = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();
const mockWarn = jest.fn();
const mockLogger = { info: mockInfo, warn: mockWarn, error: mockError, debug: jest.fn(), flush: mockFlush };

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "user-1",
    displayName: "TestUser",
    bungieMembershipType: 3,
    bungieMembershipId: "123",
  }),
  getBungieToken: jest.fn().mockResolvedValue("fake-token"),
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn(),
    rpc: jest.fn().mockResolvedValue({ data: false, error: null }),
  },
}));

jest.mock("@/lib/stats/record", () => ({
  detectAndRecordGame: jest.fn().mockResolvedValue({ status: "no_game" }),
}));

function makeDetectRequest() {
  return new NextRequest("https://example.com/api/stats/detect", {
    method: "POST",
    headers: { "x-trace-id": "test-trace-789", "content-type": "application/json" },
    body: JSON.stringify({ lobbyId: "00000000-0000-0000-0000-000000000001" }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/stats/detect logging", () => {
  it("logs detect.start and detect.skipped with reason lobby_done", async () => {
    jest.mocked(adminSupabase.from).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { status: "done" }, error: null }),
    } as any);

    const res = await POST(makeDetectRequest());
    expect(res.status).toBe(200);
    expect(mockInfo).toHaveBeenCalledWith("detect.start", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
    }));
    expect(mockInfo).toHaveBeenCalledWith("detect.skipped", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      reason: "lobby_done",
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("logs detect.error and flushes on auth failure", async () => {
    jest.mocked(requireSession).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await POST(makeDetectRequest());
    expect(res.status).toBe(401);
    expect(mockError).toHaveBeenCalledWith("detect.error", expect.objectContaining({
      error: "Unauthorized",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });
});
