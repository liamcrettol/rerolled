-- 059: Drop the dormant Score Attack / Weekly Challenge substrate.
--
-- The UI for Score Attack and Weekly Challenge was removed in #342; the
-- worker/stats code substrate was deleted from the repo alongside this
-- migration (worker, evaluators, weekly libs, process-jobs cron route).
-- This drops everything only that dead code touched. Kept on purpose:
--   - challenge_runs / challenge_run_participants / challenge_run_loadout_slots
--     (read by the dashboard season history and Crucible match enrichment)
--   - player_season_stats / player_lifetime_stats / seasons
--     (read by lib/stats/season.ts for the dashboard "Your Season" panel)
--   - badges / player_badges (badge display is still live)
--   - all crucible_* tables and pgcr_cache (head-to-head is live)
--   - weekly_challenges / weekly_challenge_versions: NOT dropped yet. The
--     dashboard season history and Crucible match enrichment still read
--     weekly_challenges for run titles, and challenge_runs holds FKs to
--     both. They go when the season panel does.
--
-- Also stops pg_cron from pinging the deleted /api/cron/process-jobs route
-- every 15 minutes (scheduled in 056).

-- Stop the cron ping for the deleted route.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'ping-process-jobs') then
    perform cron.unschedule('ping-process-jobs');
  end if;
end $$;

-- Per-run worker outputs. All writers were deleted; nothing reads them.
-- run_processing_events must go before worker_jobs (job_id FK).
drop table if exists run_compliance_results;
drop table if exists run_equipment_snapshots;
drop table if exists run_legality_results;
drop table if exists run_processing_events;
drop table if exists run_trials_passage_snapshots;
drop table if exists challenge_run_events;

-- Worker job queue (028). Functions first, then the table.
drop function if exists claim_next_worker_job(text, integer);
drop function if exists complete_worker_job(uuid);
drop function if exists fail_worker_job(uuid, text, timestamptz);
drop table if exists worker_jobs;

-- Weekly challenge system (029, 047): drop the leaderboard + its accessor
-- functions only. weekly_challenges / weekly_challenge_versions stay (see
-- header) until the season panel is removed.
drop function if exists get_active_weekly_challenge();
drop function if exists get_weekly_leaderboard(uuid, integer, integer);
drop function if exists get_user_weekly_best(text, uuid);
drop table if exists weekly_leaderboard_entries;

-- Season leaderboard (score attack placements).
drop table if exists season_leaderboard_entries;

-- Weekly per-player aggregates (worker-written, unread).
drop table if exists player_weekly_stats;

-- Legacy draft tables superseded by lobby_draft_options/lobby_draft_votes.
-- Zero code references.
drop table if exists draft_picks;
drop table if exists draft_sessions;
