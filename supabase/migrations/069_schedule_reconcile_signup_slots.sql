-- 069 - Schedule the orphaned signup-slot reconciliation cron (#386).
--
-- Same ping_cron_endpoint() mechanism as the other crons (migration 056) -
-- no new Vault secrets needed. Cadence matches the endpoint's 30-minute
-- orphan-age threshold (app/api/cron/reconcile-signup-slots/route.ts).

do $$
begin
  if to_regprocedure('public.ping_cron_endpoint(text)') is null then
    raise exception 'ping_cron_endpoint(text) is missing; apply migration 056 first';
  end if;
end;
$$;

select cron.schedule(
  'ping-reconcile-signup-slots',
  '*/30 * * * *',
  $$select public.ping_cron_endpoint('/api/cron/reconcile-signup-slots')$$
);
