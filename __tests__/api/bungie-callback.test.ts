/** @jest-environment node */
// #239 — the OAuth callback must keep raw upstream error bodies server-side and
// only redirect the user with a stable, generic error code.
import { NextRequest } from "next/server";

const mockFrom = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
// @auth/core/jwt is ESM-only and not transformed by jest; the token-exchange
// failure path never reaches encode(), so stubbing it is safe.
jest.mock("@auth/core/jwt", () => ({ encode: jest.fn() }));
jest.mock("@/lib/auth/encrypt", () => ({ encryptToken: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: (req: NextRequest) => Promise<any>;

beforeAll(() => {
  process.env.NEXTAUTH_URL = "https://test.app";
  process.env.BUNGIE_API_KEY = "test-key";
  process.env.BUNGIE_CLIENT_ID = "cid";
  process.env.BUNGIE_CLIENT_SECRET = "csecret";
  // Require after env is set so module-level BASE_URL picks up the test host.
  GET = require("@/app/api/auth/bungie/callback/route").GET;
});

beforeEach(() => {
  jest.clearAllMocks();
  // Valid CSRF state lookup, and a resolvable delete chain.
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { state: "valid-state", return_to: null }, error: null }),
    delete: jest.fn().mockReturnThis(),
  };
  mockFrom.mockReturnValue(query);
});

const SECRET_BODY = "SUPER_SECRET_UPSTREAM_BODY_12345";

it("redirects with a generic code and keeps the raw token-exchange body out of the URL", async () => {
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    text: async () => SECRET_BODY,
  }) as unknown as typeof fetch;

  const res = await GET(
    new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
  );

  const location = res.headers.get("location");
  // User-facing redirect carries only the stable code…
  expect(location).toBe("https://test.app/auth/error?error=token_exchange_failed");
  // …and never the raw upstream body.
  expect(location).not.toContain(SECRET_BODY);
  // Detail is still logged server-side for debugging.
  expect(errSpy).toHaveBeenCalledWith(
    "[bungie/callback] failed at:",
    expect.stringContaining(SECRET_BODY),
  );
  errSpy.mockRestore();
});

it("maps a Bungie-supplied error param to the generic bungie_error code", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  const res = await GET(
    new NextRequest("https://test.app/api/auth/bungie/callback?error=access_denied&state=valid-state"),
  );
  expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=bungie_error");
});
