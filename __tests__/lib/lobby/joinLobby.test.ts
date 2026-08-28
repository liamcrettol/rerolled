/** @jest-environment node */
// Regression test: joinLobby's upsert used to unconditionally include
// is_captain: false, which fires on every rejoin (re-clicking an invite link,
// a retried request) as well as a genuine first join. If the row belonged to
// the current captain, that silently cleared their captain flag with no
// rotation to reassign it, wedging captain rotation (see rotateCaptain.test.ts).

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: jest.fn() },
}));

import { joinLobby } from "@/lib/lobby";
import { adminSupabase } from "@/lib/supabase/admin";

const mockFrom = adminSupabase.from as jest.Mock;

describe("joinLobby", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("does not include is_captain in the lobby_members upsert payload", async () => {
    let capturedPayload: Record<string, unknown> | null = null;

    mockFrom.mockImplementation((table: string) => {
      if (table === "lobbies") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: "lobby-1", code: "ABCD", status: "waiting" },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === "lobby_members") {
        return {
          upsert: (payload: Record<string, unknown>) => {
            capturedPayload = payload;
            return {
              select: () => ({
                single: async () => ({ data: { id: "member-1", ...payload }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await joinLobby("ABCD", "user-2", "Guardian", 3, "bungie-id-2");

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload).not.toHaveProperty("is_captain");
  });
});
