/** @jest-environment node */
import { NextRequest } from "next/server";

const mockFrom = jest.fn();
const mockRpc = jest.fn().mockResolvedValue({ data: 0, error: null });
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const mockCloseIdleLobbies = jest.fn();
jest.mock("@/lib/lobby", () => ({
  closeIdleLobbies: (...args: unknown[]) => mockCloseIdleLobbies(...args),
}));

// This route only reaches getBungieToken/detectAndRecordGame once it finds a
// stuck lobby, which none of these tests exercise (empty roll_history) - mocked
// anyway so requiring the route doesn't pull in next-auth's ESM-only deps.
jest.mock("@/lib/auth/helpers", () => ({
  getBungieToken: jest.fn(),
}));
jest.mock("@/lib/stats/record", () => ({
  detectAndRecordGame: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: (req: NextRequest) => Promise<any>;

beforeAll(() => {
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
  GET = require("@/app/api/cron/detect-games/route").GET;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: 0, error: null });
  // No pending applies, so the route returns right after the idle-close step.
  const rollHistoryQuery = {
    select: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  mockFrom.mockReturnValue(rollHistoryQuery);
});

it("surfaces a failed idle-lobby close instead of discarding it silently", async () => {
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  mockCloseIdleLobbies.mockResolvedValue({ data: null, error: { message: "connection reset" } });

  const res = await GET(new NextRequest("https://test.app/api/cron/detect-games"));

  expect(res.status).toBe(200);
  expect(errSpy).toHaveBeenCalledWith(
    "[detect-games] idle-lobby close failed",
    expect.objectContaining({ reason: "connection reset" }),
  );
  errSpy.mockRestore();
});

it("stays quiet when the idle-lobby close succeeds", async () => {
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  mockCloseIdleLobbies.mockResolvedValue({ data: [{ id: "lobby-1" }], error: null });

  const res = await GET(new NextRequest("https://test.app/api/cron/detect-games"));

  expect(res.status).toBe(200);
  expect(errSpy).not.toHaveBeenCalledWith("[detect-games] idle-lobby close failed", expect.anything());
  errSpy.mockRestore();
});

// Bug found during the 2026-08-16 production health audit: a failed
// pending-applies/existing-sessions/lobby-statuses query was only logged,
// then silently treated as "nothing to do" and returned HTTP 200 - so an
// HTTP-based monitor watching this cron's status code could never tell a
// genuine empty result apart from the query itself having failed.
describe("surfaces query failures as 500s instead of a silent empty 200 (2026-08-16 audit)", () => {
  beforeEach(() => {
    mockCloseIdleLobbies.mockResolvedValue({ data: [], error: null });
  });

  it("on a failed pending-applies query", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const rollHistoryQuery = {
      select: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } }),
    };
    mockFrom.mockReturnValue(rollHistoryQuery);

    const res = await GET(new NextRequest("https://test.app/api/cron/detect-games"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "connection reset" });
    expect(errSpy).toHaveBeenCalledWith(
      "[detect-games] pending-applies query failed",
      expect.objectContaining({ reason: "connection reset" }),
    );
    errSpy.mockRestore();
  });

  it("on a failed existing-sessions query", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation((table: string) => {
      if (table === "roll_history") {
        return {
          select: jest.fn().mockReturnThis(),
          not: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({
            data: [{ lobby_id: "lobby-1", round_id: "round-1", applied_at: "2026-08-16T00:00:00Z" }],
            error: null,
          }),
        };
      }
      if (table === "game_sessions") {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: null, error: { message: "statement timeout" } }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await GET(new NextRequest("https://test.app/api/cron/detect-games"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "statement timeout" });
    expect(errSpy).toHaveBeenCalledWith(
      "[detect-games] existing-sessions query failed",
      expect.objectContaining({ reason: "statement timeout" }),
    );
    errSpy.mockRestore();
  });

  it("on a failed lobby-statuses query", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation((table: string) => {
      if (table === "roll_history") {
        return {
          select: jest.fn().mockReturnThis(),
          not: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({
            data: [{ lobby_id: "lobby-1", round_id: "round-1", applied_at: "2026-08-16T00:00:00Z" }],
            error: null,
          }),
        };
      }
      if (table === "game_sessions") {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "lobbies") {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await GET(new NextRequest("https://test.app/api/cron/detect-games"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "connection reset" });
    expect(errSpy).toHaveBeenCalledWith(
      "[detect-games] lobby-statuses query failed",
      expect.objectContaining({ reason: "connection reset" }),
    );
    errSpy.mockRestore();
  });
});
