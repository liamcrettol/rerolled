/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/draft/leave/route";

const requireSession = jest.fn().mockResolvedValue({ userId: "user-1" });

let lobbyResult: { data: unknown; error?: unknown } = { data: null };
let memberResult: { data: unknown; error?: unknown } = { data: null };
const updateEq = jest.fn().mockResolvedValue({ error: null });
const update = jest.fn(() => ({ eq: updateEq }));

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: () => requireSession(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: (table: string) => {
      if (table === "lobbies") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () => Promise.resolve(lobbyResult),
          update,
        };
        return builder;
      }
      if (table === "lobby_members") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () => Promise.resolve(memberResult),
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

function makeRequest() {
  return new NextRequest("https://example.com/api/draft/leave", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lobbyId: "00000000-0000-0000-0000-000000000001" }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireSession.mockResolvedValue({ userId: "user-1" });
  lobbyResult = { data: { id: "l1", mode: "draft" } };
  memberResult = { data: { id: "m1" } };
});

describe("POST /api/draft/leave", () => {
  it("marks a draft lobby done when a member leaves", async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", ended_at: expect.any(String) })
    );
    expect(updateEq).toHaveBeenCalledWith("id", "00000000-0000-0000-0000-000000000001");
  });

  it("refuses to close a non-draft lobby", async () => {
    lobbyResult = { data: { id: "l1", mode: "roulette" } };

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("treats a missing membership as an idempotent no-op", async () => {
    memberResult = { data: null };

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
});
