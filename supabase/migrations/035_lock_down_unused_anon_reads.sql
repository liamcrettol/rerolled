-- ============================================================
-- 035 - Lock down anon reads on tables the browser client never touches (#276)
-- ============================================================
-- A full audit of every "use client" file confirmed these six tables are
-- NEVER read by the anon/browser Supabase client (lib/supabase/client.ts) --
-- every consumer (Leaderboard.tsx, DashboardStats.tsx, WeaponHallOfFame.tsx,
-- season stats, etc.) is a server component reading through adminSupabase
-- (service-role, bypasses RLS). The permissive "using (true)" policies below
-- served no functional purpose and let anyone holding the public anon key
-- (embedded in the browser bundle) dump every player's full roll history and
-- lifetime/season/weekly stats directly via the Supabase REST API.
--
-- RLS is already enabled on all six tables (001/005/030/032); dropping the
-- permissive policy with nothing replacing it makes them service-role-only,
-- which is the correct default since nothing anon-side needs them.
--
-- Deliberately NOT touched here: lobbies, lobby_members, lobby_rounds,
-- lobby_loadout_slots, lobby_draft_options, game_sessions, player_game_stats.
-- Those ARE read by the browser client (lobby realtime, the /watch spectator
-- page, the draft board) and dropping their anon policies would break those
-- features outright. Fully closing that remaining surface needs real
-- per-user Supabase auth (or a broadcast-only realtime rewrite) so RLS can
-- scope rows to "a lobby you're actually in" instead of "anyone with the
-- anon key" -- a separate, bigger piece of work.
--
-- Also deliberately NOT touched: weekly_leaderboard_entries,
-- season_leaderboard_entries, badges, player_badges -- these are public-facing
-- by design (a leaderboard/badge shelf is meant to be viewed by anyone), not
-- an oversight.

DROP POLICY IF EXISTS "anon read roll_history" ON roll_history;
DROP POLICY IF EXISTS "anon read weapon_round_kills" ON weapon_round_kills;
DROP POLICY IF EXISTS "anon read lobby_pools" ON lobby_pools;
DROP POLICY IF EXISTS "public read player_season_stats" ON player_season_stats;
DROP POLICY IF EXISTS "public read player_weekly_stats" ON player_weekly_stats;
DROP POLICY IF EXISTS "public read player_lifetime_stats" ON player_lifetime_stats;
