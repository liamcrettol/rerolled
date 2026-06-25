/** @jest-environment node */
import { POST } from "@/app/api/apply/route";
import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/helpers";

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
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: { captain_locked: false, round_number: 1 }, error: null }),
      not: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    }),
    rpc: jest.fn().mockResolvedValue({ data: false, error: null }),
  },
}));

jest.mock("@/lib/bungie/rawInventory", () => ({
  getRawWeapons: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/bungie/equip", () => ({
  applyWeapons: jest.fn().mockResolvedValue([]),
  ensureInventorySpace: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/bungie/definitions", () => ({
  getWeaponDefinition: jest.fn().mockResolvedValue({ name: "Weapon A", icon: "/icon/a" }),
}));

jest.mock("@/lib/lobby", () => ({
  rotateCaptain: jest.fn().mockResolvedValue(undefined),
}));

import { adminSupabase } from "@/lib/supabase/admin";

function makeApplyRequest() {
  return new NextRequest("https://example.com/api/apply", {
    method: "POST",
    headers: { "x-trace-id": "test-trace-456", "content-type": "application/json" },
    body: JSON.stringify({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      characterId: "char-1",
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(adminSupabase.from).mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: { captain_locked: false, round_number: 1 }, error: null }),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  } as any);
});

describe("POST /api/apply logging", () => {
  it("logs apply.start and apply.done on success", async () => {
    // slots query returns wildcard slots (item_hash: 0) — no weapons to equip
    jest.mocked(adminSupabase.from).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ item_hash: 0, slot: "kinetic", weapon_name: null, weapon_icon: null }], error: null }),
    } as any);

    const res = await POST(makeApplyRequest());
    expect(res.status).toBe(200);
    expect(mockInfo).toHaveBeenCalledWith("apply.start", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      characterId: "char-1",
    }));
    expect(mockInfo).toHaveBeenCalledWith("apply.done", expect.objectContaining({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });

  it("logs apply.error and flushes on auth failure", async () => {
    jest.mocked(requireSession).mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await POST(makeApplyRequest());
    expect(res.status).toBe(401);
    expect(mockError).toHaveBeenCalledWith("apply.error", expect.objectContaining({
      error: "Unauthorized",
      durationMs: expect.any(Number),
    }));
    expect(mockFlush).toHaveBeenCalled();
  });
});
