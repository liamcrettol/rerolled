// These GETs are idempotent, so the shared client's retry-with-backoff on
// 429/5xx applies safely. Bungie's API throws sporadic 500s; without retries
// each one failed a whole backfill page and turned the scheduled sync run red.
import { bungieGet } from "@/lib/bungie/client";

// Bungie allows up to 250 activities per page; 50 keeps each backfill page's PGCR
// fan-out bounded while cutting the number of round-trips vs. the old size of 20.
const HISTORY_PAGE_SIZE = 50;
const ALL_PVP_MODE = 5;

export interface CrucibleActivityHistoryEntry {
  period: string;
  activityDetails: {
    instanceId: string;
    referenceId: number;
    directorActivityHash?: number;
    mode?: number;
    modes?: number[];
  };
}

export async function getDestinyCharacterIds(
  membershipType: number,
  membershipId: string,
  accessToken: string,
): Promise<string[]> {
  const profile = await bungieGet<{
    characters?: { data?: Record<string, unknown> };
  } | undefined>(`/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`, accessToken);
  return Object.keys(profile?.characters?.data ?? {});
}

export async function getCrucibleActivityPage(
  membershipType: number,
  membershipId: string,
  characterId: string,
  page: number,
  accessToken: string,
): Promise<CrucibleActivityHistoryEntry[]> {
  const history = await bungieGet<{ activities?: CrucibleActivityHistoryEntry[] } | undefined>(
    `/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=${HISTORY_PAGE_SIZE}&mode=${ALL_PVP_MODE}&page=${page}`,
    accessToken,
  );
  return history?.activities ?? [];
}

export { HISTORY_PAGE_SIZE };

