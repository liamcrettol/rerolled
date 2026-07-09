const BUNGIE_ROOT = "https://www.bungie.net/Platform";

export interface DestinyInventoryItemDefinitionLite {
  itemType?: number;
  classType?: number;
  itemTypeDisplayName?: string;
  inventory?: { tierType?: number };
  displayProperties?: { name?: string; icon?: string };
}

const inventoryItemDefinitionCache = new Map<number, Promise<DestinyInventoryItemDefinitionLite | null>>();

function buildErrorMessage(status: number, path: string, responseBody?: string): string {
  let message = `Bungie API error ${status} on ${path}`;
  if (responseBody) {
    try {
      const json = JSON.parse(responseBody);
      if (json.Message) message += `: ${json.Message}`;
      if (json.ErrorStatus) message += ` (${json.ErrorStatus})`;
    } catch {
      // If body isn't JSON, just use the base message
    }
  }
  return message;
}

// Bungie throttles per *application key*, not per user, so every player of this
// app shares one budget. A bare fetch turns that throttling into a hard 500 for
// whoever happened to click. Retry the statuses Bungie uses to say "later", and
// honor the ThrottleSeconds it hands back. Mirrors lib/bungie/workerClient.ts,
// which has always done this; the user-facing client simply never got it.
const MAX_ATTEMPTS = Number(process.env.BUNGIE_MAX_ATTEMPTS ?? 4);
const BASE_BACKOFF_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BungieEnvelope {
  ErrorCode?: number;
  ErrorStatus?: string;
  Message?: string;
  ThrottleSeconds?: number;
  Response?: unknown;
}

function throttleDelayMs(json: BungieEnvelope): number {
  return Math.max(0, (json.ThrottleSeconds ?? 0) * 1000);
}

function isThrottled(json: BungieEnvelope): boolean {
  return throttleDelayMs(json) > 0 || json.ErrorStatus === "DestinyThrottledByGameServer";
}

async function bungieRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit,
  // A 5xx on a POST is ambiguous: the equip or transfer may already have
  // applied, so replaying it could act twice. 429 and explicit throttles are
  // safe to replay because Bungie never processed the request.
  { retryServerErrors }: { retryServerErrors: boolean }
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${BUNGIE_ROOT}${path}`, {
      ...init,
      headers: {
        "X-API-Key": process.env.BUNGIE_API_KEY!,
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
      next: { revalidate: 0 }, // always fresh
    });

    const json = (await res.json().catch(() => ({}))) as BungieEnvelope;

    if (res.ok && (!json.ErrorCode || json.ErrorCode === 1)) {
      return json.Response as T;
    }

    lastError = !res.ok
      ? new Error(buildErrorMessage(res.status, path, JSON.stringify(json)))
      : new Error(`Bungie error ${json.ErrorCode}: ${json.Message}`);

    const retryable =
      isThrottled(json) ||
      res.status === 429 ||
      res.status === 408 ||
      (retryServerErrors && res.status >= 500);

    if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;

    // Prefer Bungie's own backoff hint over our exponential guess.
    const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    await sleep(Math.max(throttleDelayMs(json), backoff));
  }

  throw lastError ?? new Error(`Bungie request failed on ${path}`);
}

export async function bungieGet<T>(path: string, accessToken: string): Promise<T> {
  return bungieRequest<T>(path, accessToken, { method: "GET" }, { retryServerErrors: true });
}

export async function bungiePost<T>(
  path: string,
  accessToken: string,
  body: unknown
): Promise<T> {
  return bungieRequest<T>(
    path,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { retryServerErrors: false }
  );
}

async function getInventoryItemDefinition(
  itemHash: number,
  accessToken: string
): Promise<DestinyInventoryItemDefinitionLite | null> {
  const cached = inventoryItemDefinitionCache.get(itemHash);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const path = `/Destiny2/Manifest/DestinyInventoryItemDefinition/${itemHash}/`;
      const res = await fetch(`${BUNGIE_ROOT}${path}`, {
        headers: {
          "X-API-Key": process.env.BUNGIE_API_KEY!,
          Authorization: `Bearer ${accessToken}`,
        },
        next: { revalidate: 3600 },
      });

      if (!res.ok) {
        inventoryItemDefinitionCache.delete(itemHash);
        return null;
      }

      const json = await res.json();
      if (json.ErrorCode && json.ErrorCode !== 1) {
        inventoryItemDefinitionCache.delete(itemHash);
        return null;
      }

      return (json.Response ?? null) as DestinyInventoryItemDefinitionLite | null;
    } catch (error) {
      inventoryItemDefinitionCache.delete(itemHash);
      throw error;
    }
  })();

  inventoryItemDefinitionCache.set(itemHash, pending);
  return pending;
}

export async function getInventoryItemDefinitions(
  itemHashes: number[],
  accessToken: string,
  batchSize = 50
): Promise<Record<string, DestinyInventoryItemDefinitionLite>> {
  const uniqueHashes = [...new Set(itemHashes.filter((hash) => Number.isFinite(hash) && hash > 0))];
  const result: Record<string, DestinyInventoryItemDefinitionLite> = {};

  for (let i = 0; i < uniqueHashes.length; i += batchSize) {
    const batch = uniqueHashes.slice(i, i + batchSize);
    const defs = await Promise.all(batch.map((hash) => getInventoryItemDefinition(hash, accessToken)));
    for (let index = 0; index < batch.length; index += 1) {
      const def = defs[index];
      if (def) result[batch[index].toString()] = def;
    }
  }

  return result;
}
