-- ============================================================
-- 052 - Bound pgcr_cache growth
-- ============================================================
-- Raw PGCRs are cached to dedupe Bungie fetches across features, but once a
-- match has been extracted into crucible_matches the raw JSON (~14 KB/row) is
-- only needed briefly for re-parse convenience. Left alone the cache grows
-- past the Supabase plan limit as backfills deepen. Prune extracted rows after
-- 24 hours; rows never imported into crucible_matches (lobby detection PGCRs,
-- PvE reports) are kept as before.

create or replace function prune_pgcr_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from pgcr_cache p
  using crucible_matches m
  where m.instance_id = p.instance_id
    and p.fetched_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function prune_pgcr_cache() from public;
grant execute on function prune_pgcr_cache() to service_role;
