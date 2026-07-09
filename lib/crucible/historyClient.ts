const BUNGIE_ROOT = "https://www.bungie.net/Platform";
const HISTORY_PAGE_SIZE = 20;
const ALL_PVP_MODE = 5;

interface BungieEnvelope<T> {
  ErrorCode?: number;
  Message?: string;
  Response?: T;
}

export interface CrucibleActivityHistoryEntry {
  period: string;
  activityDetails: {
    instanceId: string;
    referenceId: number;
    mode?: number;
    modes?: number[];
  };
}

async function bungieGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${BUNGIE_ROOT}${path}`, {
    headers: {
      "X-API-Key": process.env.BUNGIE_API_KEY!,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(`Bungie request failed (${response.status})${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
  }
  const body = await response.json() as BungieEnvelope<T>;
  if (body.ErrorCode && body.ErrorCode !== 1) {
    throw new Error(`Bungie API error ${body.ErrorCode}: ${body.Message ?? "Unknown error"}`);
  }
  if (body.Response === undefined) throw new Error("Bungie response was empty");
  return body.Response;
}

export async function getDestinyCharacterIds(
  membershipType: number,
  membershipId: string,
  accessToken: string,
): Promise<string[]> {
  const profile = await bungieGet<{
    characters?: { data?: Record<string, unknown> };
  }>(`/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`, accessToken);
  return Object.keys(profile.characters?.data ?? {});
}

export async function getCrucibleActivityPage(
  membershipType: number,
  membershipId: string,
  characterId: string,
  page: number,
  accessToken: string,
): Promise<CrucibleActivityHistoryEntry[]> {
  const history = await bungieGet<{ activities?: CrucibleActivityHistoryEntry[] }>(
    `/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=${HISTORY_PAGE_SIZE}&mode=${ALL_PVP_MODE}&page=${page}`,
    accessToken,
  );
  return history.activities ?? [];
}

export { HISTORY_PAGE_SIZE };

