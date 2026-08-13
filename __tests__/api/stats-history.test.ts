/** @jest-environment node */
import { NextRequest } from "next/server";

const mockFrom = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: (req: NextRequest) => Promise<any>;

beforeAll(() => {
  GET = require("@/app/api/stats/history/route").GET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

it("returns a clean JSON error instead of a bare 500 when the sessions query fails", async () => {
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } }),
  };
  mockFrom.mockReturnValue(query);

  const res = await GET(
    new NextRequest("https://test.app/api/stats/history?lobbyId=11111111-1111-1111-1111-111111111111"),
  );

  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body).toEqual({ error: "Unable to load match history" });
  expect(errSpy).toHaveBeenCalledWith(
    "[stats/history] failed to load round history",
    expect.objectContaining({ reason: "connection reset" }),
  );
  errSpy.mockRestore();
});

it("returns an empty rounds list when there are no sessions", async () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  mockFrom.mockReturnValue(query);

  const res = await GET(
    new NextRequest("https://test.app/api/stats/history?lobbyId=11111111-1111-1111-1111-111111111111"),
  );

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ rounds: [] });
});
