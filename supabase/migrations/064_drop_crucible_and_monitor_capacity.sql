-- 064: Finish the Rival split and bound the remaining roulette PGCR cache.

begin;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'ping-sync-crucible') then
      perform cron.unschedule('ping-sync-crucible');
    end if;
    if exists (select 1 from cron.job where jobname = 'ping-reconcile-pgcr') then
      perform cron.unschedule('ping-reconcile-pgcr');
    end if;
  end if;
end $$;

drop function if exists public.claim_crucible_sync(text, integer);

drop table if exists public.crucible_encounters;
drop table if exists public.crucible_match_players;
drop table if exists public.crucible_match_viewers;
drop table if exists public.crucible_matches;
drop table if exists public.crucible_sync_state;

drop table if exists public.challenge_run_loadout_slots;
drop function if exists public.prevent_finalized_run_loadout_mutation();
drop table if exists public.challenge_run_participants;
drop table if exists public.challenge_runs;
drop table if exists public.weekly_challenge_versions;
drop table if exists public.weekly_challenges;
drop table if exists public.seasons;

drop function if exists public.mark_pgcr_archived_if_current(bigint, text, boolean);
drop index if exists public.pgcr_cache_unarchived_idx;
drop index if exists public.pgcr_cache_uncleared_idx;
alter table public.pgcr_cache
  drop column if exists appwrite_sha256,
  drop column if exists appwrite_bytes,
  drop column if exists appwrite_migrated_at,
  drop column if exists appwrite_last_verified_at;

create or replace function public.prune_pgcr_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.pgcr_cache
  where fetched_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_pgcr_cache() from public, anon, authenticated;
grant execute on function public.prune_pgcr_cache() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'prune-pgcr-cache') then
    perform cron.schedule(
      'prune-pgcr-cache',
      '17 * * * *',
      'select public.prune_pgcr_cache()'
    );
  end if;
end $$;

create or replace function public.database_size_bytes()
returns bigint
language sql
security definer
set search_path = pg_catalog
stable
as $$
  select pg_database_size(current_database());
$$;

revoke all on function public.database_size_bytes() from public, anon, authenticated;
grant execute on function public.database_size_bytes() to service_role;

commit;
