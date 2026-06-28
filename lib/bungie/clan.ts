import { bungieGet } from "./client";

interface GroupsForMemberResponse {
  results?: Array<{
    group?: {
      name?: string;
      clanInfo?: { clanCallsign?: string };
    };
  }>;
}

/**
 * The player's primary clan (name + callsign tag), or null if they aren't in
 * one. Uses GetGroupsForMember with filter=0 (All), groupType=1 (Clan).
 */
export async function getClan(
  membershipType: number,
  membershipId: string,
  accessToken: string
): Promise<{ name: string; tag: string } | null> {
  const res = await bungieGet<GroupsForMemberResponse>(
    `/GroupV2/User/${membershipType}/${membershipId}/0/1/`,
    accessToken
  );
  const group = res.results?.[0]?.group;
  if (!group?.name) return null;
  return { name: group.name, tag: group.clanInfo?.clanCallsign ?? "" };
}
