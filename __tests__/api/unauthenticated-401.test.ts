/** @jest-environment node */
import { NextRequest } from "next/server";

// A signed-out (or expired-session) caller must get 401, never a 500 that
// looks like an outage and pollutes error logs. Found by a live production
// audit: these routes caught requireSession()'s "Unauthorized" and returned
// the generic 500.
jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockRejectedValue(new Error("Unauthorized")),
  getBungieToken: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({ adminSupabase: {} }));
jest.mock("@/lib/lobby", () => ({ createLobby: jest.fn(), closeLobby: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn() }),
}));

const routes = [
  "lobby/create",
  "lobby/ready",
  "lobby/leave",
  "roulette/roll",
  "roulette/intersection",
];

describe.each(routes)("POST /api/%s when signed out", (route) => {
  it("returns 401, not 500", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import(`@/app/api/${route}/route`);
    const res = await POST(
      new NextRequest(`http://localhost/api/${route}`, { method: "POST", body: "{}" })
    );
    expect(res.status).toBe(401);
  });
});
