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
  };
  extended?: { weapons?: PGCRWeapon[] };
}

interface PGCR {
  period: string;
  activityDetails: { instanceId: string };
  entries: PGCREntry[];
}

async function getActivityHistory(
  membershipType: number,
  membershipId: string,
  characterId: string,
  accessToken: string
): Promise<ActivityHistoryEntry[]> {
  const res = await fetch(
    `${BUNGIE_ROOT}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=15&mode=0`,
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

async function getPGCR(instanceId: string): Promise<PGCR | null> {
  const res = await fetch(
    `${BUNGIE_ROOT}/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
    { headers: { "X-API-Key": process.env.BUNGIE_API_KEY! } }
  );
  if (!res.ok) return null;
  const json = await res.json();
  if (json.ErrorCode && json.ErrorCode !== 1) return null;
  return json.Response ?? null;
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
}

export interface WeaponKillStat {
  itemHash: number;
  totalKills: number;
}

export interface PostMatchResult {
  playerStats: CollectedPlayerStat[];
  weaponKills: WeaponKillStat[];
}

export async function collectPostMatchStats(
  members: MemberStatInput[],
  rouletteHashes: number[],
  hostAccessToken: string
): Promise<PostMatchResult | null> {
  if (!members.length || !rouletteHashes.length) return null;

  const host = members[0];
  const hashSet = new Set(rouletteHashes);
  const membershipIdSet = new Set(members.map((m) => m.membershipId));

  const activities = await getActivityHistory(
    host.membershipType,
    host.membershipId,
    host.characterId,
    hostAccessToken
  );
  if (!activities.length) return null;

  for (const activity of activities) {
    const pgcr = await getPGCR(activity.activityDetails.instanceId);
    if (!pgcr) continue;

    // All fireteam members must appear in this PGCR
    const pgcrMemberIds = new Set(
      pgcr.entries.map((e) => e.player.destinyUserInfo.membershipId)
    );
    if (![...membershipIdSet].every((id) => pgcrMemberIds.has(id))) continue;

    // At least one member must have a kill with a roulette weapon
    const anyRouletteKill = pgcr.entries.some((e) =>
      e.extended?.weapons?.some((w) => hashSet.has(w.referenceId))
    );
    if (!anyRouletteKill) continue;

    // Match found - extract per-player stats
    const playerStats = members.map((member) => {
      const entry = pgcr.entries.find(
        (e) => e.player.destinyUserInfo.membershipId === member.membershipId
      );
      if (!entry) {
        return { userId: member.userId, displayName: member.displayName, kills: 0, deaths: 0, assists: 0, kd: 0, rouletteWeaponKills: 0 };
      }

      const kills = entry.values.kills?.basic?.value ?? 0;
      const deaths = entry.values.deaths?.basic?.value ?? 0;
      const assists = entry.values.assists?.basic?.value ?? 0;
      const kd = deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills;
      const rouletteWeaponKills =
        entry.extended?.weapons
          ?.filter((w) => hashSet.has(w.referenceId))
          .reduce((sum, w) => sum + (w.values.uniqueWeaponKills?.basic?.value ?? 0), 0) ?? 0;

      return { userId: member.userId, displayName: member.displayName, kills, deaths, assists, kd, rouletteWeaponKills };
    });

    // Aggregate kills per roulette weapon across all players
    const killsByHash = new Map<number, number>();
    for (const entry of pgcr.entries) {
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

    return { playerStats, weaponKills };
  }

  return null;
}
