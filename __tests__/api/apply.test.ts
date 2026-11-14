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

// Round ownership has its own tests (__tests__/lib/lobby/roundAccess.test.ts);
// here the round belongs to the lobby unless a test says otherwise.
jest.mock("@/lib/lobby/roundAccess", () => ({
  checkRoundAccess: jest.fn().mockResolvedValue("ok"),
  ROUND_MISMATCH_ERROR: "That round doesn't belong to this lobby. Refresh and try again.",
  NOT_MEMBER_ERROR: "You're not in this lobby. Try rejoining.",
}));

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "user-1",
    displayName: "TestUser",
    bungieMembershipType: 3,
    bungieMembershipId: "123",
  }),
  getBungieToken: jest.fn().mockResolvedValue("fake-token"),
  isBungieAuthErrorMessage: jest.fn((msg: string) => msg === "Unauthorized"),
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
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

jest.mock("@/lib/bungie/inventory", () => ({
  getCharacters: jest.fn().mockResolvedValue([]),
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
    upsert: jest.fn().mockResolvedValue({ error: null }),
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

  // Found by the 2026-11-14 production health audit: /api/apply never checked
  // lobby membership, so any signed-in user could overwrite a lobby's
  // roll_history, flip it to in_game and count toward captain rotation.
  it.each([
    ["not_member", "You're not in this lobby. Try rejoining."],
    ["round_mismatch", "That round doesn't belong to this lobby. Refresh and try again."],
  ])("answers 403 and writes nothing when access is %s", async (access, message) => {
    const { checkRoundAccess } = jest.requireMock("@/lib/lobby/roundAccess");
    checkRoundAccess.mockResolvedValueOnce(access);
    const from = adminSupabase.from as jest.Mock;
    from.mockClear();
    (adminSupabase.rpc as jest.Mock).mockClear();

    const res = await POST(makeApplyRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: message });
    expect(from).not.toHaveBeenCalled();
    expect(adminSupabase.rpc).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith("apply.forbidden", expect.objectContaining({ reason: access }));
  });
});
