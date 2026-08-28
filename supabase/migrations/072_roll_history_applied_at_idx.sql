-- 072 - Index roll_history(applied_at) for the applied_at-only cron query.
-- getLobbyIdsAwaitingDetection() (lib/lobby/index.ts) - shared by the
-- detect-games and cleanup-lobbies crons, run every 15-30 min - filters and
-- orders roll_history purely on applied_at with no lobby_id predicate. The
-- only existing index, roll_history_lobby_applied_idx (024_...), leads with
-- lobby_id and can't serve that scan. roll_history has no pruning/retention
-- path, so this degrades toward a full sequential scan as the table grows.
--
-- Found during the 2026-08-28 scheduled production health audit (#396).

create index if not exists roll_history_applied_at_idx
  on roll_history (applied_at)
  where applied_at is not null;
