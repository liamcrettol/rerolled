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

export async function bungieGet<T>(
  path: string,
  accessToken: string
): Promise<T> {
  const res = await fetch(`${BUNGIE_ROOT}${path}`, {
    headers: {
      "X-API-Key": process.env.BUNGIE_API_KEY!,
      Authorization: `Bearer ${accessToken}`,
    },
    next: { revalidate: 0 }, // always fresh
  });

  const json = await res.json();

  if (!res.ok) {
    const responseBody = JSON.stringify(json);
    throw new Error(buildErrorMessage(res.status, path, responseBody));
  }

  if (json.ErrorCode && json.ErrorCode !== 1) {
    throw new Error(`Bungie error ${json.ErrorCode}: ${json.Message}`);
  }

  return json.Response as T;
}

export async function bungiePost<T>(
  path: string,
  accessToken: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${BUNGIE_ROOT}${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.BUNGIE_API_KEY!,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    const responseBody = JSON.stringify(json);
    throw new Error(buildErrorMessage(res.status, path, responseBody));
  }

  if (json.ErrorCode && json.ErrorCode !== 1) {
    throw new Error(`Bungie error ${json.ErrorCode}: ${json.Message}`);
  }

  return json.Response as T;
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
