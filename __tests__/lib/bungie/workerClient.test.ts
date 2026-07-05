/** @jest-environment node */
import {
  BungieWorkerClient,
  BungieWorkerError,
  getBungieWorkerConfig,
} from "@/lib/bungie/workerClient";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function makeClient(fetchImpl: jest.Mock, sleep: jest.Mock, nowRef: { value: number }) {
  return new BungieWorkerClient({
    apiKey: "api-key",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async (ms) => {
      nowRef.value += ms;
      await sleep(ms);
    },
    now: () => nowRef.value,
    maxRps: 1000,
    maxAttempts: 3,
    baseBackoffMs: 500,
  });
}

describe("BungieWorkerClient", () => {
  it("returns successful Bungie responses", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, {
      ErrorCode: 1,
      Response: { instanceId: "pgcr-1" },
    }));
    const sleep = jest.fn();
    const client = makeClient(fetchImpl, sleep, { value: 0 });

    await expect(client.fetchPgcr("pgcr-1")).resolves.toEqual({ instanceId: "pgcr-1" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.bungie.net/Platform/Destiny2/Stats/PostGameCarnageReport/pgcr-1/",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-API-Key": "api-key" }),
      })
    );
  });

  it("retries retryable failures with exponential backoff", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(500, { Message: "temporary" }))
      .mockResolvedValueOnce(response(200, { ErrorCode: 1, Response: { ok: true } }));
    const sleep = jest.fn();
    const nowRef = { value: 0 };
    const client = makeClient(fetchImpl, sleep, nowRef);

    await expect(client.get("/retry")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("respects Bungie ThrottleSeconds before retrying", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, {
        ErrorCode: 36,
        ErrorStatus: "DestinyThrottledByGameServer",
        Message: "Throttle",
        ThrottleSeconds: 2,
      }))
      .mockResolvedValueOnce(response(200, { ErrorCode: 1, Response: { ok: true } }));
    const sleep = jest.fn();
    const nowRef = { value: 0 };
    const client = makeClient(fetchImpl, sleep, nowRef);

    await expect(client.get("/throttled")).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry permanent failures", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(400, {
      ErrorCode: 99,
      ErrorStatus: "BadRequest",
      Message: "Nope",
    }));
    const sleep = jest.fn();
    const client = makeClient(fetchImpl, sleep, { value: 0 });

    await expect(client.get("/bad")).rejects.toMatchObject({
      name: "BungieWorkerError",
      status: 400,
      errorCode: 99,
      attempts: 1,
    } satisfies Partial<BungieWorkerError>);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reads worker defaults from environment variables", () => {
    expect(
      getBungieWorkerConfig({
        BUNGIE_WORKER_MAX_RPS: "10",
        BUNGIE_EQUIPMENT_POLL_INTERVAL_SECONDS: "90",
        RUN_COMPLETION_POLL_INTERVAL_SECONDS: "45",
        PGCR_FETCH_MAX_ATTEMPTS: "5",
      })
    ).toEqual({
      maxRps: 10,
      equipmentPollIntervalSeconds: 90,
      runCompletionPollIntervalSeconds: 45,
      pgcrFetchMaxAttempts: 5,
    });
  });
});
