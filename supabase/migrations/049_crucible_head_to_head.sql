-- ============================================================
-- 049 - Crucible career history and head-to-head encounters
-- ============================================================

create table if not exists crucible_matches (
  instance_id text primary key,
  activity_hash bigint,
  activity_mode integer,
  activity_modes integer[] not null default '{}',
  mode_bucket text not null
    check (mode_bucket in ('trials', 'competitive', 'control', 'iron_banner', 'other')),
  activity_name text,
  period timestamptz not null,
  duration_seconds integer,
  is_private boolean not null default false,
  team_data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crucible_matches_period_idx on crucible_matches(period desc);
create index if not exists crucible_matches_mode_period_idx on crucible_matches(mode_bucket, period desc);
create index if not exists crucible_matches_activity_hash_idx on crucible_matches(activity_hash);

create table if not exists crucible_match_players (
  instance_id text not null references crucible_matches(instance_id) on delete cascade,
  membership_id text not null,
  membership_type integer,
  display_name text not null,
  team_id integer,
  is_win boolean,
  completed boolean,
  kills integer,
  deaths integer,
  assists integer,
  score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (instance_id, membership_id)
);

create index if not exists crucible_match_players_member_idx on crucible_match_players(membership_id, instance_id);
create index if not exists crucible_match_players_team_idx on crucible_match_players(membership_id, team_id);

create table if not exists crucible_encounters (
  viewer_user_id text not null references users(id) on delete cascade,
  viewer_membership_id text not null,
  opponent_membership_id text not null,
  opponent_membership_type integer,
  opponent_display_name text not null,
  instance_id text not null references crucible_matches(instance_id) on delete cascade,
  mode_bucket text not null
    check (mode_bucket in ('trials', 'competitive', 'control', 'iron_banner', 'other')),
  viewer_won boolean,
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (viewer_user_id, opponent_membership_id, instance_id)
);

create index if not exists crucible_encounters_pair_idx
  on crucible_encounters(viewer_user_id, opponent_membership_id, played_at desc);
create index if not exists crucible_encounters_mode_idx
  on crucible_encounters(viewer_user_id, mode_bucket, played_at desc);
create index if not exists crucible_encounters_history_idx
  on crucible_encounters(viewer_user_id, played_at desc);

create table if not exists crucible_sync_state (
  user_id text primary key references users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'syncing', 'complete', 'failed')),
  next_page integer not null default 0,
  character_ids jsonb not null default '[]'::jsonb,
  active_character_index integer not null default 0,
  last_incremental_sync_at timestamptz,
  backfill_completed_at timestamptz,
  locked_by text,
  locked_until timestamptz,
  last_error text,
  attempts integer not null default 0,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crucible_sync_state_queue_idx on crucible_sync_state(status, requested_at);
create index if not exists crucible_sync_state_lock_idx on crucible_sync_state(locked_until);

create or replace function claim_crucible_sync(
  p_worker_id text,
  p_lock_seconds integer default 55
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

alter table crucible_matches enable row level security;
alter table crucible_match_players enable row level security;
alter table crucible_encounters enable row level security;
alter table crucible_sync_state enable row level security;
