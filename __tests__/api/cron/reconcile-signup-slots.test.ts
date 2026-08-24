/** @jest-environment node */
import { NextRequest } from "next/server";

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  withSupabaseTimeout: (p: unknown) => p,
}));

const mockFindExistingRivalAccountIds = jest.fn();
jest.mock("@/lib/auth/signupCapacity", () => ({
  findExistingRivalAccountIds: (...args: unknown[]) => mockFindExistingRivalAccountIds(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: (req: NextRequest) => Promise<any>;

beforeAll(() => {
  delete process.env.CRON_SECRET;
  GET = require("@/app/api/cron/reconcile-signup-slots/route").GET;
});

function req() {
  return new NextRequest("https://test.app/api/cron/reconcile-signup-slots");
}

function candidatesQuery(rows: { user_id: string; first_site: string }[]) {
  return {
    select: jest.fn().mockReturnValue({
      lt: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  };
}

function usersExistQuery(existingIds: string[]) {
  return {
    select: jest.fn().mockReturnValue({
      in: jest.fn().mockResolvedValue({ data: existingIds.map((id) => ({ id })), error: null }),
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("releases a rerolled-origin orphan with no matching account", async () => {
  mockFrom.mockImplementation((table: string) => {
    if (table === "signup_capacity_users") return candidatesQuery([{ user_id: "orphan-1", first_site: "rerolled" }]);
    if (table === "users") return usersExistQuery([]);
    throw new Error(`unexpected table ${table}`);
  });
  mockRpc.mockResolvedValue({ data: [{ released: true, user_count: 5, max_users: 150 }], error: null });

  const res = await GET(req());
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.released).toBe(1);
  expect(mockRpc).toHaveBeenCalledWith("release_signup_slot", { p_user_id: "orphan-1" });
});

it("does not release a rerolled-origin candidate that already has a real account", async () => {
  mockFrom.mockImplementation((table: string) => {
    if (table === "signup_capacity_users") return candidatesQuery([{ user_id: "real-user", first_site: "rerolled" }]);
    if (table === "users") return usersExistQuery(["real-user"]);
    throw new Error(`unexpected table ${table}`);
  });

  const res = await GET(req());
  const body = await res.json();

  expect(body.released).toBe(0);
  expect(mockRpc).not.toHaveBeenCalled();
});

it("releases a rival-origin orphan once Rival confirms it has no account", async () => {
  mockFrom.mockImplementation((table: string) => {
    if (table === "signup_capacity_users") return candidatesQuery([{ user_id: "rival-orphan", first_site: "rival" }]);
    throw new Error(`unexpected table ${table}`);
  });
  mockFindExistingRivalAccountIds.mockResolvedValue([]);
  mockRpc.mockResolvedValue({ data: [{ released: true, user_count: 5, max_users: 150 }], error: null });

  const res = await GET(req());
  const body = await res.json();

  expect(body.released).toBe(1);
  expect(mockFindExistingRivalAccountIds).toHaveBeenCalledWith(["rival-orphan"]);
});

it("never releases a rival-origin candidate when the Rival check can't be verified (fails safe)", async () => {
  mockFrom.mockImplementation((table: string) => {
    if (table === "signup_capacity_users") return candidatesQuery([{ user_id: "rival-user", first_site: "rival" }]);
    throw new Error(`unexpected table ${table}`);
  });
  mockFindExistingRivalAccountIds.mockResolvedValue(null);

  const res = await GET(req());
  const body = await res.json();

  expect(body.released).toBe(0);
  expect(body.rivalCheckFailed).toBe(true);
  expect(mockRpc).not.toHaveBeenCalled();
});

it("returns clean zeros and skips the Rival call when there are no stale candidates", async () => {
  mockFrom.mockImplementation((table: string) => {
    if (table === "signup_capacity_users") return candidatesQuery([]);
    throw new Error(`unexpected table ${table}`);
  });

  const res = await GET(req());
  const body = await res.json();

  expect(body).toMatchObject({ ok: true, candidates: 0, released: 0 });
  expect(mockFindExistingRivalAccountIds).not.toHaveBeenCalled();
});

it("surfaces a failed candidate query as a 500 instead of releasing slots blind", async () => {
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  mockFrom.mockImplementation((table: string) => {
    if (table === "signup_capacity_users") {
      return {
        select: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  const res = await GET(req());

  expect(res.status).toBe(500);
  expect(mockRpc).not.toHaveBeenCalled();
  errSpy.mockRestore();
});
