import type { WeaponSlot } from "./bungie";

// Per-slot roll behaviour the captain controls: Random / Locked / Your own.
export type SlotMode = "normal" | "lock" | "wildcard";

// The captain's active roll settings, persisted on the lobby so non-captains
// can view them read-only (issue #106).
export interface LobbyRollSettings {
  mode: "normal" | "chaos" | "meta";
  rerollLimit: number | null; // null = unlimited
  noDup: boolean;
  banned: string[];
  slots: Record<WeaponSlot, SlotMode>;
}

export interface Lobby {
  id: string;
  code: string;
  host_user_id: string;
  captain_user_id: string;
  status: "waiting" | "rolling" | "applying" | "in_game" | "done";
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

export interface LobbyRound {
  id: string;
  lobby_id: string;
  round_number: number;
  status: "pending" | "locked" | "applied";
  created_at: string;
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

export interface RollHistoryEntry {
  round_number: number;
  slots: LobbyLoadoutSlot[];
  applied_at: string | null;
}

export type LobbyRealtimeEvent =
  | { event: "member_joined"; member: LobbyMember }
  | { event: "member_ready"; user_id: string; is_ready: boolean }
  | { event: "captain_changed"; new_captain_user_id: string }
  | { event: "slot_updated"; slot: LobbyLoadoutSlot }
  | { event: "round_locked"; round: LobbyRound }
  | { event: "apply_result"; results: ApplyResult[] };

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

export interface GameSession {
  id: string;
  lobby_id: string;
  played_at: string;
  player_count: number;
  roulette_hashes: number[];
}

export interface PlayerGameStat {
  id: string;
  game_session_id: string;
  user_id: string;
  display_name: string;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  roulette_weapon_kills: number;
  created_at: string;
}
