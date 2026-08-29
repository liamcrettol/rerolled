-- 073 - Index player_game_stats(game_session_id).
-- app/api/stats/history/route.ts queries player_game_stats with
-- .in("game_session_id", sessionIds) for up to 200 session ids at a time, but
-- the column (an FK to game_sessions, not auto-indexed by Postgres) has never
-- had a supporting index - only player_game_stats_user_idx (004_...) exists.
-- Its sibling table weapon_round_kills, added one migration later for the
-- same feature, got a game_session_id index at the time (005_...); this one
-- was missed. Same degrades-to-sequential-scan-as-the-table-grows failure
-- class migration 072 fixed for roll_history.applied_at.
--
-- Found during the 2026-08-29 scheduled production health audit (#400).

create index if not exists player_game_stats_session_idx
  on player_game_stats (game_session_id);
