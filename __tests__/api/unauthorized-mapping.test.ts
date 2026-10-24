/** @jest-environment node */
import { NextRequest } from "next/server";

// An expired or missing session makes requireSession() throw "Unauthorized".
// Every session-gated route must answer that with 401 (so the client can send
// the user back to sign in), never a generic 500 that also pollutes error logs.

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockRejectedValue(new Error("Unauthorized")),
  getBungieToken: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: jest.fn(() => { throw new Error("db must not be touched without a session"); }) },
}));

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), flush: jest.fn() })),
}));

const ROUTES = [
  "@/app/api/lobby/create/route",
  "@/app/api/lobby/leave/route",
  "@/app/api/lobby/ready/route",
  "@/app/api/roulette/intersection/route",
  "@/app/api/roulette/roll/route",
];

describe("session-gated routes without a valid session", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(ROUTES)("%s returns 401 Unauthorized", async (path) => {
    const { POST } = await import(path);
    const req = new NextRequest("https://example.com/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lobbyId: "00000000-0000-0000-0000-000000000001" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
