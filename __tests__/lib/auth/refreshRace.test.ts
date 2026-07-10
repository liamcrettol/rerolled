/** @jest-environment node */
// getBungieToken's refresh path must survive concurrent refreshes: Bungie
// rotates refresh tokens, so the DB write is compare-and-swapped against the
// ciphertext that was read, and a Bungie 400 recovers by adopting the tokens a
// concurrent winner stored.
jest.mock("@/lib/auth", () => ({ auth: jest.fn(async () => null) }));
jest.mock("@/lib/auth/encrypt", () => ({
  decryptToken: jest.fn(async (enc: string) => enc.replace(/^enc:/, "")),
  encryptToken: jest.fn(async (token: string) => `enc:${token}`),
}));

// Scriptable admin client: each test enqueues the account row(s) reads return,
// and captures update filters/payloads.
type Row = Record<string, unknown> | null;
const dbState: { reads: Row[]; updateResult: Row[]; updates: Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }> } = {
  reads: [],
  updateResult: [],
  updates: [],
};

jest.mock("@/lib/supabase/admin", () => ({
  withSupabaseTimeout: (p: unknown) => p,
  adminSupabase: {
    from: () => {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        maybeSingle: async () => ({ data: dbState.reads.shift() ?? null }),
        update: (patch: Record<string, unknown>) => {
          const updateBuilder = {
            eq: (col: string, val: unknown) => {
              filters.push([col, val]);
              return updateBuilder;
            },
            select: async () => {
              dbState.updates.push({ patch, filters });
              return { data: dbState.updateResult };
            },
          };
          return updateBuilder;
        },
      };
      return builder;
    },
  },
}));

import { getBungieToken } from "@/lib/auth/helpers";

const EXPIRED = new Date(Date.now() - 60_000).toISOString();
const FRESH = new Date(Date.now() + 3_000_000).toISOString();

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-1",
    membership_id: "500",
    access_token_enc: "enc:old-access",
    refresh_token_enc: "enc:old-refresh",
    expires_at: EXPIRED,
    oauth_client_id: null,
    ...overrides,
  };
}

function mockBungie(status: number, body: Record<string, unknown> = {}) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("getBungieToken refresh race protection", () => {
  beforeEach(() => {
    process.env.BUNGIE_API_KEY = "key";
    process.env.BUNGIE_CLIENT_ID = "53228";
    process.env.BUNGIE_CLIENT_SECRET = "secret";
    dbState.reads = [];
    dbState.updateResult = [];
    dbState.updates = [];
  });

  it("compare-and-swaps the token write against the refresh ciphertext it read", async () => {
    dbState.reads = [accountRow()];
    dbState.updateResult = [{ user_id: "user-1" }];
    mockBungie(200, { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });

    await expect(getBungieToken("user-1", "500")).resolves.toBe("new-access");
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].filters).toContainEqual(["refresh_token_enc", "enc:old-refresh"]);
    expect(dbState.updates[0].patch).toMatchObject({
      access_token_enc: "enc:new-access",
      refresh_token_enc: "enc:new-refresh",
      oauth_client_id: "53228",
    });
  });

  it("still returns its access token when the CAS write loses the race", async () => {
    dbState.reads = [accountRow()];
    dbState.updateResult = []; // no row matched: a concurrent refresh won
    mockBungie(200, { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });

    await expect(getBungieToken("user-1", "500")).resolves.toBe("new-access");
  });

  it("adopts the winner's fresh tokens when Bungie rejects an already-rotated refresh token", async () => {
    dbState.reads = [
      accountRow(),
      // re-read inside the recovery path: a concurrent refresh already stored
      // new tokens with a fresh expiry
      { access_token_enc: "enc:winner-access", refresh_token_enc: "enc:winner-refresh", expires_at: FRESH },
    ];
    mockBungie(400, { error: "invalid_request", error_description: "ProvidedTokenNotValidRefreshToken" });

    await expect(getBungieToken("user-1", "500")).resolves.toBe("winner-access");
    expect(dbState.updates).toHaveLength(0);
  });

  it("surfaces the failure when the stored refresh token is genuinely dead", async () => {
    dbState.reads = [
      accountRow(),
      // re-read shows the same ciphertext we redeemed: nobody else refreshed
      { access_token_enc: "enc:old-access", refresh_token_enc: "enc:old-refresh", expires_at: EXPIRED },
    ];
    mockBungie(400, { error: "invalid_request", error_description: "ProvidedTokenNotValidRefreshToken" });

    await expect(getBungieToken("user-1", "500")).rejects.toThrow("Bungie token refresh failed (400)");
  });

  it("fails fast when the tokens were issued by a different OAuth app", async () => {
    dbState.reads = [accountRow({ oauth_client_id: "99999" })];
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(getBungieToken("user-1", "500")).rejects.toThrow("cross-app");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
