-- ============================================================
-- 029 - Weekly + season leaderboards
-- ============================================================
-- Denormalized, worker-maintained tables (upserted after a run finalizes),
-- not views — reads happen on every homepage/profile visit and shouldn't
-- recompute from challenge_runs each time.

create table if not exists weekly_leaderboard_entries (
  id uuid primary key default uuid_generate_v4(),
  weekly_challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  season_id uuid references seasons(id),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  user_id text not null references users(id),
  bungie_membership_id text not null,
  score numeric not null,
  rank integer,
  clear_time_seconds integer,
  deaths integer,
  rolled_weapon_usage_pct numeric,
  compliance_status text check (compliance_status in ('eligible', 'flagged', 'ineligible', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One (best) entry per user per challenge; the worker upserts on a better score.
  unique (weekly_challenge_id, user_id)
);

create index if not exists weekly_leaderboard_entries_challenge_rank_idx
  on weekly_leaderboard_entries(weekly_challenge_id, rank);
create index if not exists weekly_leaderboard_entries_challenge_score_idx
  on weekly_leaderboard_entries(weekly_challenge_id, score desc);
create index if not exists weekly_leaderboard_entries_user_challenge_idx
  on weekly_leaderboard_entries(user_id, weekly_challenge_id);

create table if not exists season_leaderboard_entries (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references seasons(id) on delete cascade,
  user_id text not null references users(id),
  bungie_membership_id text not null,
  total_score numeric not null default 0,
  weekly_clears integer not null default 0,
  best_weekly_rank integer,
  total_rolled_weapon_kills integer not null default 0,
  badge_count integer not null default 0,
  rank integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, user_id)
);

create index if not exists season_leaderboard_entries_season_rank_idx
  on season_leaderboard_entries(season_id, rank);
create index if not exists season_leaderboard_entries_season_score_idx
  on season_leaderboard_entries(season_id, total_score desc);

-- ============================================================
-- QUERY HELPERS
-- ============================================================
create or replace function get_active_weekly_challenge()
returns weekly_challenges
language sql stable as $$
  select *
  from weekly_challenges
  where status = 'active'
    and starts_at <= now()
    and ends_at > now()
  order by starts_at desc
  limit 1;
$$;

create or replace function get_weekly_leaderboard(p_challenge_id uuid, p_limit integer default 50, p_offset integer default 0)
returns setof weekly_leaderboard_entries
language sql stable as $$
  select *
  from weekly_leaderboard_entries
  where weekly_challenge_id = p_challenge_id
  order by rank nulls last, score desc
  limit p_limit
  offset p_offset;
$$;

create or replace function get_user_weekly_best(p_user_id text, p_challenge_id uuid)
returns weekly_leaderboard_entries
language sql stable as $$
  select *
  from weekly_leaderboard_entries
  where user_id = p_user_id
    and weekly_challenge_id = p_challenge_id
  limit 1;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Leaderboard placement is public by nature; writes are worker-only
-- (upsert_player_stats_after_run / update_leaderboard job), never client-side.
alter table weekly_leaderboard_entries enable row level security;
alter table season_leaderboard_entries enable row level security;

create policy "public read weekly_leaderboard_entries" on weekly_leaderboard_entries
  for select using (true);
create policy "public read season_leaderboard_entries" on season_leaderboard_entries
  for select using (true);
