-- Found during the 2026-08-26 scheduled production health audit: three
-- SECURITY DEFINER RPCs never had EXECUTE revoked from public, unlike every
-- other SECURITY DEFINER function in this repo (claim_crucible_sync,
-- database_size_bytes, reserve_signup_slot, mark_pgcr_archived_if_current,
-- etc. all pair the function with a revoke/grant). Postgres defaults new
-- function EXECUTE to PUBLIC, which in Supabase includes anon/authenticated,
-- so these were callable directly via PostgREST's /rpc/<fn> with no session
-- and arbitrary parameters, bypassing the app's own server-side
-- authorization (e.g. forging players_applied entries or the detection
-- lease without ever going through /api/apply or /api/stats/detect).

revoke all on function mark_player_applied(uuid, text, uuid) from public, anon, authenticated;
grant execute on function mark_player_applied(uuid, text, uuid) to service_role;

revoke all on function claim_detection(uuid, integer) from public, anon, authenticated;
grant execute on function claim_detection(uuid, integer) to service_role;

revoke all on function get_weapon_hall_of_fame(integer) from public, anon, authenticated;
grant execute on function get_weapon_hall_of_fame(integer) to service_role;
