/** @jest-environment node */
import { POST } from "@/app/api/roulette/roll/route";
import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";

const mockFlush = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();
const mockLogger = { info: mockInfo, warn: jest.fn(), error: mockError, debug: jest.fn(), flush: mockFlush };

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
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { captain_user_id: "user-1" }, error: null }),
    }),
  },
}));

jest.mock("@/lib/roulette/intersection", () => ({
  rollLoadout: jest.fn().mockReturnValue({ kinetic: 1111, energy: 2222, power: 3333 }),
}));

function makeRollRequest() {
  return new NextRequest("https://example.com/api/roulette/roll", {
    method: "POST",
    headers: { "x-trace-id": "test-trace-123", "content-type": "application/json" },
    body: JSON.stringify({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      intersection: { kinetic: [1111], energy: [2222], power: [3333] },
      weaponDetails: {
        "1111": { name: "Weapon A", icon: "/icon/a", weaponType: "Auto Rifle", damageType: "Kinetic" },
        "2222": { name: "Weapon B", icon: "/icon/b", weaponType: "Pulse Rifle", damageType: "Solar" },
        "3333": { name: "Weapon C", icon: "/icon/c", weaponType: "Rocket Launcher", damageType: "Arc" },
      },
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/roulette/roll logging", () => {
  it("logs roll.start and roll.done on success", async () => {
    const res = await POST(makeRollRequest());
    expect(res.status).toBe(200);
    expect(mockInfo).toHaveBeenCalledWith("roll.start", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
    }));
    expect(mockInfo).toHaveBeenCalledWith("roll.done", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("logs roll.error and flushes on failure", async () => {
    jest.mocked(requireSession).mockRejectedValueOnce(new Error("Unauthorized"));

    const res = await POST(makeRollRequest());
    expect(res.status).toBe(500);
    expect(mockError).toHaveBeenCalledWith("roll.error", expect.objectContaining({
      error: "Unauthorized",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("logs roll.forbidden and flushes when caller is not captain", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.mocked(adminSupabase.from).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { captain_user_id: "other-user" }, error: null }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await POST(makeRollRequest());
    expect(res.status).toBe(403);
    const { warn } = mockLogger;
    expect(warn).toHaveBeenCalledWith("roll.forbidden", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("rejects a tampered pool whose hashes are outside the server-owned intersection (#238)", async () => {
    const original = jest.mocked(adminSupabase.from).getMockImplementation();
    // Captain check passes; the cached pool only contains different hashes, so
    // makeRollRequest's submitted intersection (1111/2222/3333) is tampering.
    jest.mocked(adminSupabase.from).mockImplementation(((table: string) => {
      if (table === "lobby_pools") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { pool: { kinetic: [9999], energy: [9999], power: [9999] }, weapon_details: {} },
            error: null,
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { captain_user_id: "user-1" }, error: null }),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    try {
      const res = await POST(makeRollRequest());
      expect(res.status).toBe(400);
      expect(mockLogger.warn).toHaveBeenCalledWith("roll.tampered_pool", expect.objectContaining({
        lobbyId: "00000000-0000-0000-0000-000000000001",
      }));
    } finally {
      // Restore the module-level implementation so later tests are unaffected.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.mocked(adminSupabase.from).mockImplementation(original as any);
    }
  });
});
