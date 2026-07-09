/** @jest-environment node */

import { bungieGet, bungiePost } from "@/lib/bungie/client";

const ok = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ ErrorCode: 1, Response: payload }),
});

const status = (code: number, body: Record<string, unknown> = {}) => ({
  ok: false,
  status: code,
  json: async () => body,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  process.env.BUNGIE_API_KEY = "test-key";
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

// Drive the retry sleeps without waiting on real timers. Each attempt awaits
// fetch() then res.json() before it reaches the sleep, so flush a handful of
// microtasks between timer advances or the pending sleep is never scheduled yet.
async function runAll<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const settled = promise.then(
    (v) => { done = true; return { ok: true as const, v }; },
    (e) => { done = true; return { ok: false as const, e }; }
  );

  for (let i = 0; i < 50 && !done; i++) {
    for (let j = 0; j < 5; j++) await Promise.resolve();
    jest.runOnlyPendingTimers();
  }

  const r = await settled;
  if (r.ok) return r.v;
  throw r.e;
}

describe("bungieGet retry", () => {
  it("returns the payload on a first-try success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ hi: true }));
    await expect(runAll(bungieGet("/x", "tok"))).resolves.toEqual({ hi: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(status(429, { ThrottleSeconds: 0 }))
      .mockResolvedValueOnce(ok({ hi: true }));

    await expect(runAll(bungieGet("/x", "tok"))).resolves.toEqual({ hi: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx on GET", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok({ hi: true }));

    await expect(runAll(bungieGet("/x", "tok"))).resolves.toEqual({ hi: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(status(401, { Message: "nope" }));
    await expect(runAll(bungieGet("/x", "tok"))).rejects.toThrow(/401/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt cap", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(status(429));
    await expect(runAll(bungieGet("/x", "tok"))).rejects.toThrow(/429/);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

describe("bungiePost retry safety", () => {
  it("retries a 429, which Bungie never processed", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok({ done: true }));

    await expect(runAll(bungiePost("/equip", "tok", {}))).resolves.toEqual({ done: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 5xx, which may have already applied the equip", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(status(500));
    await expect(runAll(bungiePost("/equip", "tok", {}))).rejects.toThrow(/500/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
