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
const mockReserveSignupSlot = jest.fn();
jest.mock("@/lib/auth/signupCapacity", () => ({
  reserveSignupSlot: (...args: unknown[]) => mockReserveSignupSlot(...args),
  releaseSignupSlot: jest.fn(),
}));

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

// #367 — a stray capacity-RPC call on every re-login meant a transient
// capacity-check blip blocked login for the entire existing user base, not
// just new signups. Returning users must skip the RPC entirely.
describe("signup capacity check for returning users (#367)", () => {
  const encode = jest.requireMock("@auth/core/jwt").encode as jest.Mock;
  const encryptToken = jest.requireMock("@/lib/auth/encrypt").encryptToken as jest.Mock;

  function tableQuery(hasExistingAccount: boolean) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      // Chainable — real code calls .abortSignal() before .maybeSingle(),
      // which is the actual terminal/resolving call.
      abortSignal: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { state: "valid-state", return_to: null }, error: null }),
      // Every write (.upsert/.update().abortSignal()) also resolves through
      // this same object shape in these tests — those call sites only read
      // `.error`, so the extra `.data` is harmless there. Only the
      // bungie_accounts read chain actually calls .maybeSingle().
      maybeSingle: jest.fn().mockResolvedValue({
        data: hasExistingAccount ? { user_id: "user-1" } : null,
        error: null,
      }),
    };
  }

  function setup(hasExistingAccount: boolean) {
    mockFrom.mockImplementation(() => tableQuery(hasExistingAccount));
    global.fetch = jest.fn((url: string) => {
      if (url.includes("/App/OAuth/token/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          Response: {
            bungieNetUser: { membershipId: "user-1", uniqueName: "Guardian#1234" },
            destinyMemberships: [{ membershipId: "d1", membershipType: 3 }],
            primaryMembershipId: "d1",
          },
        }),
      });
    }) as unknown as typeof fetch;
    encode.mockResolvedValue("signed-jwt");
    encryptToken.mockResolvedValue("encrypted");
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips the capacity RPC entirely for a returning user", async () => {
    setup(true);
    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );
    expect(res.headers.get("location")).toBe("https://test.app/dashboard");
    expect(mockReserveSignupSlot).not.toHaveBeenCalled();
  });

  it("still runs the capacity RPC for a genuinely new user", async () => {
    setup(false);
    mockReserveSignupSlot.mockResolvedValue({
      allowed: true,
      already_registered: false,
      user_count: 10,
      max_users: 150,
      status: "available",
    });
    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );
    expect(res.headers.get("location")).toBe("https://test.app/dashboard");
    expect(mockReserveSignupSlot).toHaveBeenCalledWith("user-1", "rerolled");
  });

  it("still blocks login on capacity-check failure for a genuinely new user", async () => {
    setup(false);
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockReserveSignupSlot.mockRejectedValue(new Error("capacity RPC unavailable"));
    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );
    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=signup_cap_unavailable");
  });
});
