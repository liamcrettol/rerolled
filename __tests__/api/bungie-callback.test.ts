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
jest.mock("@/lib/auth/signupCapacity", () => ({ reserveSignupSlot: jest.fn() }));

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

describe("signup capacity gating", () => {
  const mockReserveSignupSlot = require("@/lib/auth/signupCapacity").reserveSignupSlot as jest.Mock;
  const mockEncode = require("@auth/core/jwt").encode as jest.Mock;
  const mockEncryptToken = require("@/lib/auth/encrypt").encryptToken as jest.Mock;

  function chainFor(result: { data?: unknown; error?: unknown }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    ["select", "eq", "gt", "update", "upsert", "delete", "abortSignal"].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    builder.single = jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
    builder.maybeSingle = jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
    builder.then = (resolve: (value: { data: unknown; error: unknown }) => void) =>
      resolve({ data: result.data ?? null, error: result.error ?? null });
    return builder;
  }

  function bungieFetchMock() {
    return jest.fn(async (url: string) => {
      if (url.includes("/OAuth/token/")) {
        return {
          ok: true,
          text: async () => "",
          json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
        };
      }
      if (url.includes("GetMembershipsForCurrentUser")) {
        return {
          ok: true,
          json: async () => ({
            Response: {
              bungieNetUser: { membershipId: "bnet-1", uniqueName: "Guardian#1234" },
              destinyMemberships: [{ membershipId: "dest-1", membershipType: 3 }],
              primaryMembershipId: "dest-1",
            },
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  }

  function callbackRequest() {
    return new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state");
  }

  beforeEach(() => {
    mockEncode.mockResolvedValue("session-jwt");
    mockEncryptToken.mockImplementation(async (t: string) => `enc:${t}`);
    global.fetch = bungieFetchMock();
  });

  it("skips the shared capacity check entirely for a returning user, even if it would fail", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "oauth_states") return chainFor({ data: { state: "valid-state", return_to: null } });
      if (table === "bungie_accounts") return chainFor({ data: { user_id: "bnet-1" } });
      return chainFor({ data: null });
    });
    mockReserveSignupSlot.mockRejectedValue(new Error("Signup capacity verification failed: capacity_request_timeout"));

    const res = await GET(callbackRequest());

    expect(mockReserveSignupSlot).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://test.app/dashboard");
  });

  it("still runs the shared capacity check for a genuinely new user", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "oauth_states") return chainFor({ data: { state: "valid-state", return_to: null } });
      if (table === "bungie_accounts") return chainFor({ data: null });
      return chainFor({ data: null });
    });
    mockReserveSignupSlot.mockResolvedValue({
      status: "available",
      allowed: true,
      already_registered: false,
      user_count: 8,
      max_users: 150,
    });

    const res = await GET(callbackRequest());

    expect(mockReserveSignupSlot).toHaveBeenCalledWith("bnet-1", "rerolled");
    expect(res.headers.get("location")).toBe("https://test.app/dashboard");
  });

  it("still blocks a genuinely new user when the shared cap is reached", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "oauth_states") return chainFor({ data: { state: "valid-state", return_to: null } });
      if (table === "bungie_accounts") return chainFor({ data: null });
      return chainFor({ data: null });
    });
    mockReserveSignupSlot.mockResolvedValue({
      status: "capacity_reached",
      allowed: false,
      already_registered: false,
      user_count: 150,
      max_users: 150,
    });

    const res = await GET(callbackRequest());

    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=signup_cap_reached");
  });

  it("falls back to the shared capacity check when the local existing-account lookup errors", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "oauth_states") return chainFor({ data: { state: "valid-state", return_to: null } });
      if (table === "bungie_accounts") {
        // The existence check (maybeSingle) errors, but the later upsert write
        // (then) must still succeed so this test isolates the fallback behavior.
        const builder = chainFor({ data: null });
        builder.maybeSingle = jest.fn(async () => ({ data: null, error: { message: "db blip" } }));
        return builder;
      }
      return chainFor({ data: null });
    });
    mockReserveSignupSlot.mockResolvedValue({
      status: "available",
      allowed: true,
      already_registered: false,
      user_count: 8,
      max_users: 150,
    });

    const res = await GET(callbackRequest());

    expect(mockReserveSignupSlot).toHaveBeenCalledWith("bnet-1", "rerolled");
    expect(res.headers.get("location")).toBe("https://test.app/dashboard");
  });
});
