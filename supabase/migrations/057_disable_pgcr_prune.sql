-- ============================================================
-- 057 - Disable destructive pgcr_cache pruning
-- ============================================================
-- Migration 052 made prune_pgcr_cache() delete raw_pgcr for any row with a
-- matching crucible_matches record older than 24h. Raw PGCRs are cornerstone
-- H2H source data and must be retained permanently (see docs/pgcr-archive.md)
-- - deleting them was a bug in intent, not a maintenance feature. Confirmed
-- live: the function exists with the 052 definition, pg_stat_statements shows
-- it has been called, and pg_stat_user_tables shows substantial deletions on
-- this table. app/api/cron/sync-crucible/route.ts is updated in the same
-- change to stop invoking it.
--
-- This migration replaces the function body with a no-op that always returns
-- 0, rather than dropping the function outright, so any already-deployed
-- application version that still calls prune_pgcr_cache() (via RPC) keeps
-- working harmlessly instead of erroring. Signature, security posture,
-- search_path, and grants are unchanged from 052 on purpose.
--
-- The durable replacement for "bound pgcr_cache growth" is the Appwrite
-- archive + verified-clear lifecycle in lib/pgcr/service.ts, not a delete.

create or replace function public.prune_pgcr_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return 0;
end;
$$;

revoke all on function public.prune_pgcr_cache() from public;
grant execute on function public.prune_pgcr_cache() to service_role;
