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
const mockReleaseSignupSlot = jest.fn();
jest.mock("@/lib/auth/signupCapacity", () => ({
  reserveSignupSlot: (...args: unknown[]) => mockReserveSignupSlot(...args),
  releaseSignupSlot: (...args: unknown[]) => mockReleaseSignupSlot(...args),
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

  // #368 follow-up - encryptToken() throwing left a reserved slot orphaned
  // forever, same failure shape as the user_upsert_failed branch which
  // already releases it.
  it("releases the reserved slot when token encryption fails for a new user", async () => {
    setup(false);
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockReserveSignupSlot.mockResolvedValue({
      allowed: true,
      already_registered: false,
      user_count: 10,
      max_users: 150,
      status: "available",
    });
    encryptToken.mockRejectedValue(new Error("encryption backend unavailable"));

    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );

    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=encrypt_failed");
    expect(mockReleaseSignupSlot).toHaveBeenCalledWith("user-1", "rerolled");
  });
});

// Production audit finding — reservedNewSlot was set to true on ANY
// allowed=true response, including already_registered=true. A real prior
// registrant whose local bungie_accounts lookup missed/timed out (so
// isReturningUser=false) would hit the capacity RPC, get recognized as
// already registered, and then have their genuine ledger row deleted by
// releaseSignupSlot if a later write in the same request failed - silently
// freeing a slot and letting the lifetime cap drift upward. Only a
// reservation this request actually created may ever be released.
describe("signup slot release safety for real prior registrants", () => {
  const encode = jest.requireMock("@auth/core/jwt").encode as jest.Mock;
  const encryptToken = jest.requireMock("@/lib/auth/encrypt").encryptToken as jest.Mock;

  function tableQuery(writeError: { message: string; code?: string } | null = null) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      abortSignal: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { state: "valid-state", return_to: null }, error: null }),
      // isReturningUser's local lookup always misses in these tests - the
      // scenario under test is exactly what happens when that lookup can't
      // find an account that the capacity ledger already knows about.
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      error: writeError,
    };
  }

  function setupTables(opts: { usersError?: typeof WRITE_ERROR; accountsError?: typeof WRITE_ERROR } = {}) {
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") return tableQuery(opts.usersError ?? null);
      if (table === "bungie_accounts") return tableQuery(opts.accountsError ?? null);
      return tableQuery(null);
    });
  }

  function setupFetch() {
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

  const WRITE_ERROR = { message: "duplicate key value violates unique constraint", code: "23505" };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not release a real prior registrant's slot when the users upsert fails", async () => {
    setupFetch();
    jest.spyOn(console, "error").mockImplementation(() => {});
    setupTables({ usersError: WRITE_ERROR });
    mockReserveSignupSlot.mockResolvedValue({
      allowed: true,
      already_registered: true,
      user_count: 150,
      max_users: 150,
      status: "already_registered",
    });

    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );

    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=user_upsert_failed");
    expect(mockReleaseSignupSlot).not.toHaveBeenCalled();
  });

  it("still releases a genuinely new user's slot when the users upsert fails", async () => {
    setupFetch();
    jest.spyOn(console, "error").mockImplementation(() => {});
    setupTables({ usersError: WRITE_ERROR });
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

    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=user_upsert_failed");
    expect(mockReleaseSignupSlot).toHaveBeenCalledWith("user-1", "rerolled");
  });

  it("does not release a real prior registrant's slot when the bungie_accounts upsert fails", async () => {
    setupFetch();
    jest.spyOn(console, "error").mockImplementation(() => {});
    setupTables({ accountsError: WRITE_ERROR });
    mockReserveSignupSlot.mockResolvedValue({
      allowed: true,
      already_registered: true,
      user_count: 150,
      max_users: 150,
      status: "already_registered",
    });

    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );

    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=account_upsert_failed");
    expect(mockReleaseSignupSlot).not.toHaveBeenCalled();
  });

  it("releases a genuinely new user's slot when the bungie_accounts upsert fails", async () => {
    setupFetch();
    jest.spyOn(console, "error").mockImplementation(() => {});
    setupTables({ accountsError: WRITE_ERROR });
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

    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=account_upsert_failed");
    expect(mockReleaseSignupSlot).toHaveBeenCalledWith("user-1", "rerolled");
  });
});
