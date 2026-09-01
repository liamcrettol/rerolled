-- 073 - Index player_game_stats(game_session_id) for the stats/history route.
-- game_session_id is a FK to game_sessions (004_game_stats.sql) but was never
-- indexed - only user_id was. Its sibling table weapon_round_kills (005, same
-- feature) got a game_session_id index at creation; this one was missed.
-- app/api/stats/history/route.ts queries player_game_stats with
-- .in("game_session_id", sessionIds) for up to 200 session ids per call, which
-- is a full sequential scan without this index - same failure class 072 fixed
-- for roll_history.applied_at.
--
-- Found during the 2026-08-29 scheduled production health audit (#400).

create index if not exists player_game_stats_session_idx
  on player_game_stats (game_session_id);
