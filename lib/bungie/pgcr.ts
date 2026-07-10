import { adminSupabase } from "@/lib/supabase/admin";

const BUNGIE_ROOT = "https://www.bungie.net/Platform";

interface ActivityHistoryEntry {
  activityDetails: { instanceId: string; referenceId: number };
  period: string;
}

interface PGCRWeapon {
  referenceId: number;
  values: {
    uniqueWeaponKills: { basic: { value: number } };
  };
}

interface PGCREntry {
  characterId: string;
  player: { destinyUserInfo: { membershipId: string; membershipType: number } };
  values: {
    kills: { basic: { value: number } };
    deaths: { basic: { value: number } };
    assists: { basic: { value: number } };
    killsDeathsRatio: { basic: { value: number } };
    standing?: { basic: { value: number } }; // PvP only: 0 = win, 1 = loss
  };
  extended?: { weapons?: PGCRWeapon[] };
}

interface PGCR {
  period: string;
  activityDetails: { instanceId: string; isPrivate?: boolean };
  entries: PGCREntry[];
}

async function getActivityHistory(
  membershipType: number,
  membershipId: string,
  characterId: string,
  accessToken: string
): Promise<ActivityHistoryEntry[]> {
  const res = await fetch(
    `${BUNGIE_ROOT}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=50&mode=0`,
    {
      headers: {
        "X-API-Key": process.env.BUNGIE_API_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.Response?.activities ?? [];
}

export async function resolveActivity(hash: number): Promise<{ name: string | null; image: string | null }> {
  try {
    const res = await fetch(
      `${BUNGIE_ROOT}/Destiny2/Manifest/DestinyActivityDefinition/${hash}/`,
      { headers: { "X-API-Key": process.env.BUNGIE_API_KEY! } }
    );
    if (!res.ok) return { name: null, image: null };
    const json = await res.json();
    const def = json.Response;
    // pgcrImage is the map banner. Some activities leave it empty, so fall back
    // to null rather than surfacing an empty path the UI would try to load.
    const image = typeof def?.pgcrImage === "string" && def.pgcrImage.length > 0 ? def.pgcrImage : null;
    return { name: (def?.displayProperties?.name as string) ?? null, image };
  } catch {
    return { name: null, image: null };
  }
}

export async function resolveActivityName(hash: number): Promise<string | null> {
  return (await resolveActivity(hash)).name;
}

// A PGCR is immutable once the match ends, so it is worth caching forever. The
// score-attack worker (lib/scoreAttack/worker/detection.ts) already fills the
// same `pgcr_cache` table; reading it here means the lobby detection path stops
// re-fetching reports the worker has already pulled. Bungie throttles per app
// key, so every avoided fetch is budget back for user-facing calls.
async function readCachedPGCR(instanceId: string): Promise<PGCR | null> {
  try {
    const { data } = await adminSupabase
      .from("pgcr_cache")
      .select("raw_pgcr")
      .eq("instance_id", instanceId)
      .maybeSingle();
    return (data?.raw_pgcr as PGCR | undefined) ?? null;
  } catch {
    // A cache miss and a cache outage are the same thing to the caller: go to
    // Bungie. Never fail detection because the cache was slow.
    return null;
  }
}

async function writeCachedPGCR(instanceId: string, pgcr: PGCR): Promise<void> {
  try {
    const now = new Date().toISOString();
    await adminSupabase.from("pgcr_cache").upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        instance_id: instanceId,
        raw_pgcr: pgcr,
        status: "fetched",
        fetched_at: now,
        updated_at: now,
      } as any,
      { onConflict: "instance_id" }
    );
  } catch {
    // Caching is an optimization; a failed write must not fail the detection.
  }
}

// Exported for tests; callers inside this module use it directly.
export async function getPGCR(instanceId: string): Promise<PGCR | null> {
  const cached = await readCachedPGCR(instanceId);
  if (cached) return cached;

  const res = await fetch(
    `${BUNGIE_ROOT}/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
    { headers: { "X-API-Key": process.env.BUNGIE_API_KEY! } }
  );
  if (!res.ok) return null;
  const json = await res.json();
  if (json.ErrorCode && json.ErrorCode !== 1) return null;

  const pgcr: PGCR | null = json.Response ?? null;
  if (pgcr) await writeCachedPGCR(instanceId, pgcr);
  return pgcr;
}

export interface MemberStatInput {
  userId: string;
  displayName: string;
  membershipType: number;
  membershipId: string;
  characterId: string;
}

export interface CollectedPlayerStat {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  rouletteWeaponKills: number;
  won: boolean | null; // null when the activity has no win/loss (PvE)
}

interface WeaponKillStat {
  itemHash: number;
  totalKills: number;
}

interface PostMatchResult {
  playerStats: CollectedPlayerStat[];
  weaponKills: WeaponKillStat[];
  activityHash: number;
  isPrivate: boolean;
}

export async function collectPostMatchStats(
  members: MemberStatInput[],
  rouletteHashes: number[],
  accessToken: string,
  // userId whose token `accessToken` is. Activity history must be queried for
  // THIS member, otherwise the bearer token won't match the membership being
  // requested and a private profile returns nothing (silently losing stats).
  tokenOwnerUserId: string,
  // Only consider games that started after this timestamp (ISO string).
  // Prevents matching games played before the roulette loadout was applied (#27).
  appliedAfter?: string
): Promise<PostMatchResult | null> {
  if (!members.length || !rouletteHashes.length) return null;

  // The activity-history source must be the member whose token we hold.
  const source = members.find((m) => m.userId === tokenOwnerUserId) ?? members[0];
  const hashSet = new Set(rouletteHashes);
  const membershipIdSet = new Set(members.map((m) => m.membershipId));

  // Only accept PGCRs from games that started at or after the apply time
  // (with a 60-second buffer for clock skew).
  const afterMs = appliedAfter ? new Date(appliedAfter).getTime() - 60_000 : 0;

  const activities = await getActivityHistory(
    source.membershipType,
    source.membershipId,
    source.characterId,
    accessToken
  );
  if (!activities.length) return null;

  for (const activity of activities) {
    if (afterMs > 0 && new Date(activity.period).getTime() < afterMs) continue;
    const pgcr = await getPGCR(activity.activityDetails.instanceId);
    if (!pgcr) continue;

    // All fireteam members must appear in this PGCR
    const pgcrMemberIds = new Set(
      pgcr.entries.map((e) => e.player.destinyUserInfo.membershipId)
    );
    if (![...membershipIdSet].every((id) => pgcrMemberIds.has(id))) continue;

    // PvE activities have no standing (win/loss) field — skip them
    const isPvP = pgcr.entries.some(
      (e) =>
        membershipIdSet.has(e.player.destinyUserInfo.membershipId) &&
        e.values.standing?.basic?.value != null
    );
    if (!isPvP) continue;

    // Match found - extract per-player stats
    const playerStats = members.map((member) => {
      const entry = pgcr.entries.find(
        (e) => e.player.destinyUserInfo.membershipId === member.membershipId
      );
      if (!entry) {
        return { userId: member.userId, displayName: member.displayName, kills: 0, deaths: 0, assists: 0, kd: 0, rouletteWeaponKills: 0, won: null };
      }

      const kills = entry.values.kills?.basic?.value ?? 0;
      const deaths = entry.values.deaths?.basic?.value ?? 0;
      const assists = entry.values.assists?.basic?.value ?? 0;
      const kd = deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills;
      const rouletteWeaponKills =
        entry.extended?.weapons
          ?.filter((w) => hashSet.has(w.referenceId))
          .reduce((sum, w) => sum + (w.values.uniqueWeaponKills?.basic?.value ?? 0), 0) ?? 0;
      const standing = entry.values.standing?.basic?.value;
      const won = standing == null ? null : standing === 0;

      return { userId: member.userId, displayName: member.displayName, kills, deaths, assists, kd, rouletteWeaponKills, won };
    });

    // Aggregate kills per roulette weapon across the FIRETEAM only (not the
    // whole lobby - otherwise opponents using the same gun inflate the totals).
    const killsByHash = new Map<number, number>();
    for (const entry of pgcr.entries) {
      if (!membershipIdSet.has(entry.player.destinyUserInfo.membershipId)) continue;
      for (const w of entry.extended?.weapons ?? []) {
        if (hashSet.has(w.referenceId)) {
          killsByHash.set(
            w.referenceId,
            (killsByHash.get(w.referenceId) ?? 0) + (w.values.uniqueWeaponKills?.basic?.value ?? 0)
          );
        }
      }
    }
    const weaponKills: WeaponKillStat[] = [...killsByHash.entries()].map(([itemHash, totalKills]) => ({ itemHash, totalKills }));

    return { playerStats, weaponKills, activityHash: activity.activityDetails.referenceId, isPrivate: pgcr.activityDetails.isPrivate ?? false };
  }

  return null;
}
