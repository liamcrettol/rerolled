import { mergeDraftRosterMember } from "@/lib/draft/roster";
import type { LobbyMember } from "@/types/lobby";

function member(overrides: Partial<LobbyMember> = {}): LobbyMember {
  return {
    id: "member-1",
    lobby_id: "lobby-1",
    user_id: "user-1",
    display_name: "Memo",
    bungie_membership_type: 3,
    bungie_membership_id: "membership-1",
    selected_character_id: null,
    emblem_path: null,
    emblem_background_path: null,
    clan_name: null,
    clan_tag: null,
    is_ready: false,
    is_captain: true,
    is_spectator: false,
    joined_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("mergeDraftRosterMember", () => {
  it("keeps server-enriched Bungie identity fields when realtime sends nulls", () => {
    const previous = member({
      selected_character_id: "character-1",
      emblem_path: "/emblem.png",
      emblem_background_path: "/emblem-background.png",
      clan_name: "Invictus",
      clan_tag: "INV",
    });
    const realtime = member({ is_ready: true });

    expect(mergeDraftRosterMember(previous, realtime)).toMatchObject({
      is_ready: true,
      selected_character_id: "character-1",
      emblem_path: "/emblem.png",
      emblem_background_path: "/emblem-background.png",
      clan_name: "Invictus",
      clan_tag: "INV",
    });
  });

  it("accepts newer non-null identity fields", () => {
    const merged = mergeDraftRosterMember(
      member({ emblem_background_path: "/old.png" }),
      member({ emblem_background_path: "/new.png" }),
    );
    expect(merged.emblem_background_path).toBe("/new.png");
  });
});
