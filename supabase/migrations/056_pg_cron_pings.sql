-- Move scheduled cron pings from GitHub Actions to pg_cron (#351).
--
-- GitHub delivers `schedule` events best-effort: the */10 sync-crucible cron
-- observably fired roughly hourly. pg_cron runs inside our own Postgres and
-- fires exactly on schedule; pg_net makes the authorized HTTP call to the
-- production cron endpoints.
--
-- Secrets are NOT in this file: ping_cron_endpoint reads `cron_app_url` and
-- `cron_secret` from Supabase Vault. Rotate by updating the Vault entries
-- (Dashboard -> Project Settings -> Vault), no redeploy or migration needed.
-- The GitHub workflows keep workflow_dispatch for manual runs; only their
-- schedule triggers were removed.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.ping_cron_endpoint(path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  bearer text;
  request_id bigint;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'cron_app_url';
  select decrypted_secret into bearer from vault.decrypted_secrets where name = 'cron_secret';
  if base_url is null or bearer is null then
    raise exception 'Vault secrets cron_app_url / cron_secret are missing';
  end if;

  -- 90s timeout: the endpoints cap at maxDuration 60s, so pg_net must not
  -- hang up first (an early client abort risks killing the invocation).
  select net.http_get(
    url := base_url || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || bearer),
    timeout_milliseconds := 90000
  ) into request_id;

  return request_id;
end;
$$;

-- Only the postgres/cron machinery may ping; client roles must not be able to
-- trigger (or time-probe) the cron endpoints through the API.
revoke all on function public.ping_cron_endpoint(text) from public, anon, authenticated;

-- cron.schedule upserts by job name, so re-running this migration is safe.
-- Cadences match what the GitHub workflows declared (they just never fired
-- that often in practice).
select cron.schedule('ping-sync-crucible', '*/10 * * * *', $$select public.ping_cron_endpoint('/api/cron/sync-crucible')$$);
select cron.schedule('ping-process-jobs', '*/15 * * * *', $$select public.ping_cron_endpoint('/api/cron/process-jobs')$$);
select cron.schedule('ping-cleanup-lobbies', '*/15 * * * *', $$select public.ping_cron_endpoint('/api/cron/cleanup-lobbies')$$);
select cron.schedule('ping-detect-games', '*/30 * * * *', $$select public.ping_cron_endpoint('/api/cron/detect-games')$$);
