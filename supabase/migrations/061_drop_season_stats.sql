-- 061: Drop the season/lifetime aggregate stats (core-slim plan, Phase 2).
--
-- The /leaderboards and /stats pages and the dashboard "Your Season" panel
-- were removed alongside this migration; lib/stats/season.ts (the only
-- reader of these tables) went with them, and their only writer was the
-- worker deleted in 059.
--
-- Kept on purpose:
--   - seasons: still FK-referenced by challenge_runs and weekly_challenges,
--     which the Crucible match-history enrichment reads until the H2H split
--     (Phase 5). All three go together then.
--   - game_sessions / player_game_stats / weapon_round_kills / roll_history:
--     the in-lobby roulette stats, which are core and stay.

drop table if exists player_season_stats;
drop table if exists player_lifetime_stats;
