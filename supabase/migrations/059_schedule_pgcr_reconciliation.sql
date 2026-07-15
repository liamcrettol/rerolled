-- Retry PGCR payloads retained in the Supabase outbox after a transient
-- Appwrite upload, verification, or metadata-stamp failure. The endpoint is
-- bounded below Vercel's hard timeout and only clears raw_pgcr after the
-- Appwrite object has been downloaded and checksum-verified.

do $$
begin
  if to_regprocedure('public.ping_cron_endpoint(text)') is null then
    raise exception 'ping_cron_endpoint(text) is missing; apply migration 056 first';
  end if;
end;
$$;

select cron.schedule(
  'ping-reconcile-pgcr',
  '*/5 * * * *',
  $$select public.ping_cron_endpoint('/api/cron/reconcile-pgcr')$$
);
