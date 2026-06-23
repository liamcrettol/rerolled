-- ============================================================
-- 007 — Win/loss tracking per player per game
-- ============================================================
-- PvP PGCRs expose a per-player "standing" (0 = win, 1 = loss). PvE games
-- have no standing, so this stays null there.

alter table player_game_stats
  add column if not exists won boolean;
