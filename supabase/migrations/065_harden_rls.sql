-- ============================================================
-- 065 - Harden RLS: close the auth_codes/oauth_states gap, drop
-- stale unused anon-read policies, revoke default grants on
-- backend-only tables.
--
-- Context: RLS-enabled tables with zero policies already default-deny
-- anon/authenticated (confirmed: no INSERT/UPDATE/DELETE policy exists
-- anywhere in this repo's migration history - all writes are
-- service-role only, per CLAUDE.md). The real gaps are:
--   1. auth_codes / oauth_states never had RLS enabled at all.
--   2. weapon_round_kills / lobby_pools have unused anon SELECT
--      policies (nothing in the browser reads them directly).
-- The 8 tables the browser actually subscribes to via postgres_changes
-- Realtime or reads directly (lobbies, lobby_members, lobby_rounds,
-- lobby_loadout_slots, lobby_draft_options, lobby_draft_votes,
-- game_sessions, player_game_stats) KEEP their existing anon-read
-- policies unchanged - that's load-bearing for live gameplay sync.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Close the auth_codes / oauth_states gap
-- ------------------------------------------------------------
alter table public.auth_codes enable row level security;
alter table public.oauth_states enable row level security;

-- No policies created for these two - default-deny for anon/authenticated
-- is correct. They're only ever touched by the OAuth callback route via
-- the service-role client, which bypasses RLS entirely.

revoke all on public.auth_codes from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Drop stale, unused anon-read policies
-- ------------------------------------------------------------
drop policy if exists "anon read weapon_round_kills" on public.weapon_round_kills;
drop policy if exists "anon read lobby_pools" on public.lobby_pools;

revoke all on public.weapon_round_kills from anon, authenticated;
revoke all on public.lobby_pools from anon, authenticated;

-- roll_history: confirmed not queried by the browser anywhere; drop the
-- original 001_initial.sql policy if it's still present live (it's absent
-- from your reported pg_policies output, so this is likely already gone -
-- included for idempotency).
drop policy if exists "anon read roll_history" on public.roll_history;
revoke all on public.roll_history from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Revoke default grants on the other backend-only tables
--    (RLS + no policy already blocks all rows; this is defense in
--    depth so PostgREST returns a clean permission error instead of
--    relying solely on RLS, and so a future stray policy add doesn't
--    silently expose data via a grant nobody remembered was there)
-- ------------------------------------------------------------
revoke all on public.users from anon, authenticated;
revoke all on public.bungie_accounts from anon, authenticated;
revoke all on public.cached_manifest_metadata from anon, authenticated;
revoke all on public.pgcr_cache from anon, authenticated;
revoke all on public.lobby_weapon_usage from anon, authenticated;

-- ------------------------------------------------------------
-- 4. Re-affirm the 8 intentionally-public tables (no functional
--    change - just makes the grant explicit instead of relying on
--    whatever Supabase's default schema grant happened to be)
-- ------------------------------------------------------------
grant select on public.lobbies to anon, authenticated;
grant select on public.lobby_members to anon, authenticated;
grant select on public.lobby_rounds to anon, authenticated;
grant select on public.lobby_loadout_slots to anon, authenticated;
grant select on public.lobby_draft_options to anon, authenticated;
grant select on public.lobby_draft_votes to anon, authenticated;
grant select on public.game_sessions to anon, authenticated;
grant select on public.player_game_stats to anon, authenticated;

comment on policy "anon read lobbies" on public.lobbies is
  'Intentional: browser subscribes via postgres_changes Realtime using the anon key (no Supabase Auth in this app - NextAuth/Bungie session only). Do not drop.';
comment on policy "anon read lobby_members" on public.lobby_members is
  'Intentional: Realtime subscription target (useLobbySession, DraftBoard, WatchView). Do not drop.';
comment on policy "anon read lobby_rounds" on public.lobby_rounds is
  'Intentional: read directly by useLobbySession.ts via supabase.from("lobby_rounds"). Do not drop.';
comment on policy "anon read lobby_loadout_slots" on public.lobby_loadout_slots is
  'Intentional: Realtime subscription target for loadout reveal. Do not drop.';
comment on policy "anon read lobby_draft_options" on public.lobby_draft_options is
  'Intentional: Realtime subscription target for DraftBoard. Do not drop.';
comment on policy "anon read lobby_draft_votes" on public.lobby_draft_votes is
  'Intentional: Realtime subscription target for DraftBoard voting. Do not drop.';
comment on policy "anon read game_sessions" on public.game_sessions is
  'Intentional: Realtime INSERT trigger for live match detection (useGameDetection, DashboardLiveRefresh). Do not drop.';
comment on policy "anon read player_game_stats" on public.player_game_stats is
  'Intentional: Realtime INSERT trigger for DashboardLiveRefresh. Do not drop.';
