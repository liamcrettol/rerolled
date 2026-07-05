const BUNGIE_ROOT = "https://www.bungie.net/Platform";

export interface BungieWorkerConfig {
  maxRps: number;
  equipmentPollIntervalSeconds: number;
  runCompletionPollIntervalSeconds: number;
  pgcrFetchMaxAttempts: number;
}

export interface BungieWorkerClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxRps?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
}

interface BungieEnvelope<T> {
  Response?: T;
  ErrorCode?: number;
  ErrorStatus?: string;
  Message?: string;
  ThrottleSeconds?: number;
}

export class BungieWorkerError extends Error {
  readonly status?: number;
  readonly errorCode?: number;
  readonly errorStatus?: string;
  readonly attempts: number;

  constructor(
    message: string,
    details: {
      status?: number;
      errorCode?: number;
      errorStatus?: string;
      attempts: number;
    }
  ) {
    super(message);
    this.name = "BungieWorkerError";
    this.status = details.status;
    this.errorCode = details.errorCode;
    this.errorStatus = details.errorStatus;
    this.attempts = details.attempts;
  }
}

function readEnvNumber(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number
): number {
  const raw = env[key];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getBungieWorkerConfig(
  env: Record<string, string | undefined> = process.env
): BungieWorkerConfig {
  return {
    maxRps: readEnvNumber(env, "BUNGIE_WORKER_MAX_RPS", 20),
    equipmentPollIntervalSeconds: readEnvNumber(env, "BUNGIE_EQUIPMENT_POLL_INTERVAL_SECONDS", 120),
    runCompletionPollIntervalSeconds: readEnvNumber(env, "RUN_COMPLETION_POLL_INTERVAL_SECONDS", 60),
    pgcrFetchMaxAttempts: readEnvNumber(env, "PGCR_FETCH_MAX_ATTEMPTS", 8),
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function isSuccessfulEnvelope<T>(json: BungieEnvelope<T>): boolean {
  return json.ErrorCode === undefined || json.ErrorCode === 1;
}

function buildBungieErrorMessage(path: string, status: number | undefined, envelope: BungieEnvelope<unknown>): string {
  const parts = [`Bungie worker request failed on ${path}`];
  if (status) parts.push(`HTTP ${status}`);
  if (envelope.ErrorCode) parts.push(`ErrorCode ${envelope.ErrorCode}`);
  if (envelope.ErrorStatus) parts.push(envelope.ErrorStatus);
  if (envelope.Message) parts.push(envelope.Message);
  return parts.join(": ");
}

export class BungieWorkerClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private nextAllowedAt = 0;

  constructor(options: BungieWorkerClientOptions = {}) {
    const envConfig = getBungieWorkerConfig();
    this.apiKey = options.apiKey ?? process.env.BUNGIE_API_KEY ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => Date.now());
    this.minIntervalMs = Math.ceil(1000 / (options.maxRps ?? envConfig.maxRps));
    this.maxAttempts = options.maxAttempts ?? envConfig.pgcrFetchMaxAttempts;
    this.baseBackoffMs = options.baseBackoffMs ?? 500;
  }

  async get<T>(path: string, accessToken?: string): Promise<T> {
    return this.request<T>("GET", path, undefined, accessToken);
  }

  async post<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
    return this.request<T>("POST", path, body, accessToken);
  }

  fetchPgcr<T>(instanceId: string): Promise<T> {
    return this.get<T>(`/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`);
  }

  private async waitForRateLimit(): Promise<void> {
    const now = this.now();
    const waitMs = Math.max(0, this.nextAllowedAt - now);
    if (waitMs > 0) await this.sleep(waitMs);
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + this.minIntervalMs;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    accessToken?: string
  ): Promise<T> {
    let lastEnvelope: BungieEnvelope<T> = {};
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      await this.waitForRateLimit();
      const response = await this.fetchImpl(`${BUNGIE_ROOT}${path}`, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      lastStatus = response.status;
      lastEnvelope = (await response.json().catch(() => ({}))) as BungieEnvelope<T>;

      if (response.ok && isSuccessfulEnvelope(lastEnvelope)) {
        return lastEnvelope.Response as T;
      }

      const throttleMs = Math.max(0, (lastEnvelope.ThrottleSeconds ?? 0) * 1000);
      const retryable =
        throttleMs > 0 ||
        isRetryableStatus(response.status) ||
        (!isSuccessfulEnvelope(lastEnvelope) && lastEnvelope.ErrorStatus === "DestinyThrottledByGameServer");

      if (!retryable || attempt === this.maxAttempts) {
        throw new BungieWorkerError(
          buildBungieErrorMessage(path, response.status, lastEnvelope),
          {
            status: response.status,
            errorCode: lastEnvelope.ErrorCode,
            errorStatus: lastEnvelope.ErrorStatus,
            attempts: attempt,
          }
        );
      }

      const backoffMs = throttleMs || this.baseBackoffMs * 2 ** (attempt - 1);
      await this.sleep(backoffMs);
    }

    throw new BungieWorkerError(buildBungieErrorMessage(path, lastStatus, lastEnvelope), {
      status: lastStatus,
      errorCode: lastEnvelope.ErrorCode,
      errorStatus: lastEnvelope.ErrorStatus,
      attempts: this.maxAttempts,
    });
  }
}
