import type { WeaponSlot } from "./bungie";

// Per-slot roll behaviour the captain controls: Random / Locked / Your own.
export type SlotMode = "normal" | "lock" | "wildcard";

// The captain's active roll settings, persisted on the lobby so non-captains
// can view them read-only (issue #106).
export interface LobbyRollSettings {
  mode: "normal" | "chaos" | "meta";
  rerollLimit: number | null; // null = unlimited
  /** Legacy compatibility flag; the server now always prevents repeats. */
  noDup: boolean;
  banned: string[];
  slots: Record<WeaponSlot, SlotMode>;
}

export type LobbyMode = "roulette" | "draft";

// A lobby's mode determines which board it lives on. Every join/rejoin
// redirect (invite links, the dashboard join form, active-session rejoin)
// must route through this - sending a member to the wrong board strands them
// where they can never see their fireteam's session.
export const MODE_BASE_PATH: Record<LobbyMode, string> = {
  roulette: "/lobby",
  draft: "/draft",
};

export interface Lobby {
  id: string;
  code: string;
  host_user_id: string;
  captain_user_id: string;
  status: "waiting" | "rolling" | "applying" | "in_game" | "done";
  mode: LobbyMode;
  current_round: number;
  created_at: string;
  last_active_at?: string;
  captain_locked?: boolean;
  roll_settings?: LobbyRollSettings | null;
}

export interface LobbyMember {
  id: string;
  lobby_id: string;
  user_id: string;
  display_name: string;
  bungie_membership_type: number;
  bungie_membership_id: string;
  selected_character_id: string | null;
  emblem_path: string | null;
  emblem_background_path: string | null;
  clan_name: string | null;
  clan_tag: string | null;
  is_ready: boolean;
  is_captain: boolean;
  is_spectator: boolean;
  joined_at: string;
}

export interface LobbyLoadoutSlot {
  id: string;
  round_id: string;
  slot: WeaponSlot;
  item_hash: number;
  weapon_name: string;
  weapon_icon: string;
  weapon_type: string;
  damage_type: string;
  locked_by_user_id: string;
  created_at: string;
}

export interface ApplyResult {
  user_id: string;
  display_name: string;
  slot: WeaponSlot;
  item_hash: number;
  success: boolean;
  error?: string; // concise, user-facing message (shown when a failed row is expanded)
  weapon_name?: string; // weapon involved in this transaction
  weapon_icon?: string; // Bungie icon path, rendered as https://www.bungie.net${weapon_icon}
  error_detail?: string; // raw underlying technical error (shown under "Detail" when expanded)
  kind?: "vault"; // marks a vault-clear ("made room") row, which has no real weapon slot
}
