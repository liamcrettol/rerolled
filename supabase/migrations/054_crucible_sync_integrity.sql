-- ============================================================
-- 054 - Make Crucible sync checkpoints and viewer imports lossless
-- ============================================================

-- Capture the beginning of a complete history pass. Using the completion time
-- as the next cutoff can skip matches played while a long pass is in progress.
alter table crucible_sync_state
  add column if not exists sync_started_at timestamptz;

update crucible_sync_state
set sync_started_at = requested_at
where sync_started_at is null
  and status in ('queued', 'syncing');

-- A global match row does not prove that the viewer-specific encounter rows
-- were materialized. Track that separately so recent sync can dedupe per user,
-- including teamless matches that legitimately have no encounters.
create table if not exists crucible_match_viewers (
  viewer_user_id text not null references users(id) on delete cascade,
  viewer_membership_id text not null,
  instance_id text not null references crucible_matches(instance_id) on delete cascade,
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (viewer_user_id, instance_id)
);

create index if not exists crucible_match_viewers_history_idx
  on crucible_match_viewers(viewer_user_id, played_at desc);

-- Deliberately do not infer old viewer links from the global player table: a
-- player appearing in a PGCR does not prove their viewer-specific encounters
-- were ever imported. Their next recent/backfill pass will safely materialize
-- the complete viewer data and then write this marker.

alter table crucible_match_viewers enable row level security;

-- The worker can run close to the 60-second function limit. Keep its lease
-- longer than the request so a second invocation cannot reclaim live work.
create or replace function claim_crucible_sync(
  p_worker_id text,
  p_lock_seconds integer default 90
)
returns crucible_sync_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync crucible_sync_state;
begin
  select * into v_sync
  from crucible_sync_state
  where (status = 'queued' and requested_at <= now())
     or (status = 'syncing' and locked_until < now())
  order by requested_at
  limit 1
  for update skip locked;

  if v_sync.user_id is null then
    return null;
  end if;

  update crucible_sync_state
  set status = 'syncing',
      locked_by = p_worker_id,
      locked_until = now() + make_interval(secs => p_lock_seconds),
      attempts = attempts + 1,
      updated_at = now()
  where user_id = v_sync.user_id
  returning * into v_sync;

  return v_sync;
end;
$$;

revoke all on function claim_crucible_sync(text, integer) from public;
grant execute on function claim_crucible_sync(text, integer) to service_role;
