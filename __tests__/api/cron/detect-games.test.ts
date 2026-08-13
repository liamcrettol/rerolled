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
