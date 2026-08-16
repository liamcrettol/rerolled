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

  // Bug found during the 2026-08-13 production health audit: a slot the RPC
  // reports as `already_registered` was still marked as ours to release,
  // so a later write failure could hand back a real, already-consumed slot
  // to a different new signup and let the lifetime cap be exceeded.
  it("never releases a slot the RPC reports as already_registered, even if a later write fails", async () => {
    setup(false);
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockReserveSignupSlot.mockResolvedValue({
      allowed: true,
      already_registered: true,
      user_count: 150,
      max_users: 150,
      status: "already_registered",
    });
    encryptToken.mockRejectedValue(new Error("encryption backend unavailable"));

    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );

    expect(res.headers.get("location")).toBe("https://test.app/auth/error?error=encrypt_failed");
    expect(mockReleaseSignupSlot).not.toHaveBeenCalled();
  });

  // Bug found during the 2026-08-13 production health audit: the
  // bungie_accounts upsert failure branch never released a slot it had
  // reserved, unlike the sibling encrypt_failed/user_upsert_failed
  // branches - a non-transient bungie_accounts write failure permanently
  // shrank the lifetime cap for a signup that never completed.
  it("releases the reserved slot when the bungie_accounts upsert fails for a new user", async () => {
    setup(false);
    mockFrom.mockImplementation((table: string) => {
      if (table === "bungie_accounts") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          upsert: jest.fn().mockReturnThis(),
          abortSignal: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: (v: { error: { message: string } }) => void) =>
              resolve({ error: { message: "constraint violation" } }),
          }),
        };
      }
      return tableQuery(false);
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
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

  // Bug found during the 2026-08-16 production health audit: a *transient*
  // users-upsert failure took the "continue with session-only auth" path
  // unconditionally, even for a brand-new signup that had just reserved a
  // slot. That left a session cookie with no backing users/bungie_accounts
  // rows at all, and (unlike the non-transient branch) never released the
  // slot - a permanent leak on every transient blip during a fresh signup.
  it("fails closed and releases the reserved slot when the users upsert fails transiently for a new user", async () => {
    setup(false);
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          upsert: jest.fn().mockReturnThis(),
          abortSignal: jest.fn().mockReturnValue({
            then: (resolve: (v: { error: { message: string } }) => void) =>
              resolve({ error: { message: "request timed out" } }),
          }),
        };
      }
      return tableQuery(false);
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
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

    expect(res.headers.get("location")).toBe(
      "https://test.app/auth/error?error=user_upsert_transient_failure",
    );
    expect(mockReleaseSignupSlot).toHaveBeenCalledWith("user-1", "rerolled");
  });

  // Same leak, second write site: a transient bungie_accounts-upsert failure
  // on a fresh signup must also fail closed and release the slot rather than
  // continuing with a session that has no bungie_accounts row.
  it("fails closed and releases the reserved slot when the bungie_accounts upsert fails transiently for a new user", async () => {
    setup(false);
    mockFrom.mockImplementation((table: string) => {
      if (table === "bungie_accounts") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          upsert: jest.fn().mockReturnThis(),
          abortSignal: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: (v: { error: { message: string } }) => void) =>
              resolve({ error: { message: "connection timed out" } }),
          }),
        };
      }
      return tableQuery(false);
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
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

    expect(res.headers.get("location")).toBe(
      "https://test.app/auth/error?error=account_upsert_transient_failure",
    );
    expect(mockReleaseSignupSlot).toHaveBeenCalledWith("user-1", "rerolled");
  });

  // Guard the resilience this fallback was actually built for (#367-adjacent):
  // a RETURNING user (no slot reserved this request) must still get a
  // session-only cookie on a transient blip instead of being locked out.
  it("still continues with session-only auth on a transient users-upsert failure for a returning user", async () => {
    setup(true);
    mockFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          upsert: jest.fn().mockReturnThis(),
          abortSignal: jest.fn().mockReturnValue({
            then: (resolve: (v: { error: { message: string } }) => void) =>
              resolve({ error: { message: "request timed out" } }),
          }),
        };
      }
      return tableQuery(true);
    });
    jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(
      new NextRequest("https://test.app/api/auth/bungie/callback?code=abc&state=valid-state"),
    );

    expect(res.headers.get("location")).toBe("https://test.app/dashboard");
    expect(mockReserveSignupSlot).not.toHaveBeenCalled();
    expect(mockReleaseSignupSlot).not.toHaveBeenCalled();
  });
});
