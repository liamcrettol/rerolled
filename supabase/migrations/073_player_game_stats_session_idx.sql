-- 073 - Index player_game_stats(game_session_id).
--
-- game_session_id is a FK to game_sessions (migration 004) but was never
-- indexed, unlike its sibling table weapon_round_kills (migration 005,
-- same feature) which got weapon_round_kills_session_idx. app/api/stats/
-- history/route.ts queries player_game_stats with .in("game_session_id",
-- sessionIds) for up to 200 session ids at once - without this index that
-- scan degrades toward sequential as the table grows, same failure class
-- migration 072 fixed for roll_history.applied_at.
--
-- Found during the 2026-08-29 scheduled production health audit (#400).

create index if not exists player_game_stats_session_idx
  on player_game_stats (game_session_id);
