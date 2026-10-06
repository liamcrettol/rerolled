/** @jest-environment node */
import { NextRequest } from "next/server";

// A missing/expired session must surface as 401 so the client can send the
// user back through sign-in, not as a 500 "Something went wrong".
jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockRejectedValue(new Error("Unauthorized")),
  getBungieToken: jest.fn(),
  isBungieAuthErrorMessage: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({ adminSupabase: { from: jest.fn() } }));
jest.mock("@/lib/lobby", () => ({ createLobby: jest.fn() }));
jest.mock("next-axiom", () => ({
  Logger: class { info() {} warn() {} error() {} flush() { return Promise.resolve(); } with() { return this; } },
  withAxiom: (fn: unknown) => fn,
}));

const routes: Array<[string, string]> = [
  ["lobby/create", "@/app/api/lobby/create/route"],
  ["lobby/ready", "@/app/api/lobby/ready/route"],
  ["lobby/leave", "@/app/api/lobby/leave/route"],
  ["roulette/roll", "@/app/api/roulette/roll/route"],
  ["roulette/intersection", "@/app/api/roulette/intersection/route"],
];

describe("unauthenticated requests", () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  it.each(routes)("%s returns 401", async (name, path) => {
    const { POST } = await import(path);
    const req = new NextRequest(`http://localhost/api/${name}`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
