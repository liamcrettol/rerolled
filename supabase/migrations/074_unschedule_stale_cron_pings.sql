-- Found during the 2026-09-21 scheduled production health audit: migration
-- 056 (evidently adapted from Rival's own pg_cron ping migration and not
-- fully adjusted for this repo) scheduled two jobs pinging routes that only
-- exist in Rival, not here - /api/cron/sync-crucible and
-- /api/cron/process-jobs never existed in this repo (git log --all
-- --diff-filter=A -- app/api/cron/sync-crucible app/api/cron/process-jobs
-- is empty; only detect-games, cleanup-lobbies, and reconcile-signup-slots
-- exist under app/api/cron/). Since 056 was applied, both jobs have been
-- firing every 10/15 minutes against a static 404 on rerolled.io. No data
-- is written and nothing is authenticated by the 404 response, so this was
-- wasted requests only, not a security or correctness issue - unscheduling
-- both.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ping-sync-crucible') then
    perform cron.unschedule('ping-sync-crucible');
  end if;

  if exists (select 1 from cron.job where jobname = 'ping-process-jobs') then
    perform cron.unschedule('ping-process-jobs');
  end if;
end;
$$;
