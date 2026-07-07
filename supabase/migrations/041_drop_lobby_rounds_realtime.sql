-- ============================================================
-- 041 - Stop publishing lobby_rounds to Realtime
-- ============================================================
-- lobby_rounds has no client-side postgres_changes subscriber anywhere in the
-- app (lobbies, lobby_members, lobby_loadout_slots, game_sessions,
-- player_game_stats, and lobby_draft_options all do). Keeping it in the
-- publication just makes Realtime decode WAL changes for it with nothing
-- listening - pure overhead.

alter publication supabase_realtime drop table if exists lobby_rounds;
