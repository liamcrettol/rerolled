import type { LobbyMember } from "@/types/lobby";

// The draft page enriches the current member with fresh Bungie character and
// clan data. Realtime lobby rows can still contain null for those cosmetic
// fields, so a refresh must not erase the richer server-rendered values.
export function mergeDraftRosterMember(
  previous: LobbyMember | undefined,
  current: LobbyMember,
): LobbyMember {
  if (!previous) return current;
  return {
    ...previous,
    ...current,
    selected_character_id: current.selected_character_id ?? previous.selected_character_id,
    emblem_path: current.emblem_path ?? previous.emblem_path,
    emblem_background_path: current.emblem_background_path ?? previous.emblem_background_path,
    clan_name: current.clan_name ?? previous.clan_name,
    clan_tag: current.clan_tag ?? previous.clan_tag,
  };
}
