-- ============================================================
-- 024 - Index roll_history for the detect/collect polling query
-- ============================================================
-- /api/stats/detect (polled every 10s by every fireteam member during an
-- active round) and /api/stats/collect both query:
--   SELECT ... FROM roll_history WHERE lobby_id = ? ORDER BY applied_at DESC LIMIT 1
-- roll_history had no index covering lobby_id (Postgres doesn't auto-index FK
-- columns), so this was a sequential scan + sort on every poll tick from every
-- client for the life of the table.
CREATE INDEX IF NOT EXISTS roll_history_lobby_applied_idx
  ON roll_history (lobby_id, applied_at DESC);
