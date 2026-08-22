/** @jest-environment node */
import { NextRequest } from "next/server";

const mockCloseIdleLobbies = jest.fn();
const mockGetLobbyIdsAwaitingDetection = jest.fn();
jest.mock("@/lib/lobby", () => ({
  closeIdleLobbies: (...args: unknown[]) => mockCloseIdleLobbies(...args),
  getLobbyIdsAwaitingDetection: (...args: unknown[]) => mockGetLobbyIdsAwaitingDetection(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: (req: NextRequest) => Promise<any>;

beforeAll(() => {
  delete process.env.CRON_SECRET;
  GET = require("@/app/api/cron/cleanup-lobbies/route").GET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

it("passes lobbies awaiting PGCR detection as exclusions to closeIdleLobbies (2026-08-22 audit)", async () => {
  mockGetLobbyIdsAwaitingDetection.mockResolvedValue({
    pending: [{ lobbyId: "lobby-1", roundId: "round-1", appliedAt: "2026-08-22T00:00:00Z" }],
    error: null,
  });
  const select = jest.fn().mockResolvedValue({ data: [{ id: "lobby-2" }], error: null });
  mockCloseIdleLobbies.mockReturnValue({ select });

  const res = await GET(new NextRequest("https://test.app/api/cron/cleanup-lobbies"));
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(mockCloseIdleLobbies).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    ["lobby-1"]
  );
  expect(body.closed).toBe(1);
});

it("surfaces a failed pending-detection lookup as a 500 instead of closing lobbies blind", async () => {
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  mockGetLobbyIdsAwaitingDetection.mockResolvedValue({ pending: [], error: { message: "connection reset" } });

  const res = await GET(new NextRequest("https://test.app/api/cron/cleanup-lobbies"));
  const body = await res.json();

  expect(res.status).toBe(500);
  expect(body).toEqual({ error: "connection reset" });
  expect(mockCloseIdleLobbies).not.toHaveBeenCalled();
  errSpy.mockRestore();
});
