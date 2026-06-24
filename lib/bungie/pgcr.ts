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
    `${BUNGIE_ROOT}/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?count=25&mode=0`,
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
  won: boolean | null; // null when the activity has no win/loss (PvE)
}

export interface WeaponKillStat {
  itemHash: number;
  totalKills: number;
}

export interface PostMatchResult {
  playerStats: CollectedPlayerStat[];
  weaponKills: WeaponKillStat[];
  activityHash: number;
}

export async function collectPostMatchStats(
  members: MemberStatInput[],
  rouletteHashes: number[],
  accessToken: string,
  // userId whose token `accessToken` is. Activity history must be queried for
  // THIS member, otherwise the bearer token won't match the membership being
  // requested and a private profile returns nothing (silently losing stats).
  tokenOwnerUserId: string
): Promise<PostMatchResult | null> {
  if (!members.length || !rouletteHashes.length) return null;

  // The activity-history source must be the member whose token we hold.
  const source = members.find((m) => m.userId === tokenOwnerUserId) ?? members[0];
  const hashSet = new Set(rouletteHashes);
  const membershipIdSet = new Set(members.map((m) => m.membershipId));

  const activities = await getActivityHistory(
    source.membershipType,
    source.membershipId,
    source.characterId,
    accessToken
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

    // At least one FIRETEAM MEMBER must have a kill with a roulette weapon
    // (ignore opponents who happen to use the same gun, so we don't match the
    // wrong game).
    const anyRouletteKill = pgcr.entries.some(
      (e) =>
        membershipIdSet.has(e.player.destinyUserInfo.membershipId) &&
        e.extended?.weapons?.some((w) => hashSet.has(w.referenceId))
    );
    if (!anyRouletteKill) continue;

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

    return { playerStats, weaponKills, activityHash: activity.activityDetails.referenceId };
  }

  return null;
}
