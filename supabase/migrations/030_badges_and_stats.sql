-- ============================================================
-- 030 - Badge catalog, awards, and player stats aggregation
-- ============================================================

create table if not exists badges (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  description text not null,
  category text not null
    check (category in ('completion', 'performance', 'compliance', 'difficulty', 'streak', 'founder')),
  tier text not null default 'bronze'
    check (tier in ('bronze', 'silver', 'gold', 'platinum', 'special')),
  icon_key text,
  is_active boolean not null default true,
  is_hidden boolean not null default false,
  is_repeatable boolean not null default false,
  sort_order integer not null default 0,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists badges_category_idx on badges(category);

create table if not exists player_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null references users(id),
  bungie_membership_id text,
  badge_id uuid not null references badges(id),
  earned_at timestamptz not null default now(),
  source_run_id uuid references challenge_runs(id),
  source_weekly_challenge_id uuid references weekly_challenges(id),
  season_id uuid references seasons(id),
  metadata jsonb not null default '{}'::jsonb,
  -- Idempotency/uniqueness scope: 'once' for non-repeatable badges, or the
  -- season/week the badge instance belongs to for repeatable ones. Set by the
  -- awarding code (lib/badges/evaluators.ts), not derived in SQL, since it
  -- depends on badges.is_repeatable at award time.
  scope_key text not null default 'once',
  unique (user_id, badge_id, scope_key)
);

create index if not exists player_badges_user_idx on player_badges(user_id);
create index if not exists player_badges_badge_idx on player_badges(badge_id);

-- ============================================================
-- PLAYER STATS AGGREGATION
-- ============================================================
create table if not exists player_season_stats (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null references users(id),
  season_id uuid not null references seasons(id),
  total_runs integer not null default 0,
  completed_runs integer not null default 0,
  weekly_clears integer not null default 0,
  best_weekly_rank integer,
  best_weekly_score numeric,
  best_score_attack_score numeric,
  total_rolled_weapon_kills integer not null default 0,
  total_weapon_kills integer not null default 0,
  rolled_weapon_usage_pct numeric,
  total_deaths integer not null default 0,
  flawless_clears integer not null default 0,
  no_reroll_clears integer not null default 0,
  eligible_leaderboard_runs integer not null default 0,
  flagged_ineligible_runs integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, season_id)
);

create index if not exists player_season_stats_season_idx on player_season_stats(season_id);

create table if not exists player_weekly_stats (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null references users(id),
  weekly_challenge_id uuid not null references weekly_challenges(id),
  season_id uuid references seasons(id),
  runs integer not null default 0,
  best_score numeric,
  best_rank integer,
  clears integer not null default 0,
  deaths integer not null default 0,
  rolled_weapon_usage_pct numeric,
  compliance_status text check (compliance_status in ('eligible', 'flagged', 'ineligible', 'unknown')),
  updated_at timestamptz not null default now(),
  unique (user_id, weekly_challenge_id)
);

create index if not exists player_weekly_stats_challenge_idx on player_weekly_stats(weekly_challenge_id);

create table if not exists player_lifetime_stats (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null unique references users(id),
  total_runs integer not null default 0,
  completed_runs integer not null default 0,
  weekly_clears integer not null default 0,
  best_weekly_rank integer,
  best_weekly_score numeric,
  best_score_attack_score numeric,
  total_rolled_weapon_kills integer not null default 0,
  total_weapon_kills integer not null default 0,
  rolled_weapon_usage_pct numeric,
  total_deaths integer not null default 0,
  flawless_clears integer not null default 0,
  no_reroll_clears integer not null default 0,
  eligible_leaderboard_runs integer not null default 0,
  flagged_ineligible_runs integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  favorite_weapon_hash bigint,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STATS AGGREGATION ENTRY POINT (stub)
-- ============================================================
-- Full aggregation logic (streaks, favorite weapon, compliance rollups)
-- belongs with the worker pipeline that owns scoring/compliance (Codex's
-- side). This stub establishes the entry point and guarantees stat rows
-- exist so joins from profile/leaderboard pages don't need left-join
-- null-handling for a user's first run; it fills in the fields that are
-- directly derivable from challenge_runs alone.
create or replace function upsert_player_stats_after_run(p_run_id uuid)
returns void
language plpgsql as $$
declare
  v_run challenge_runs;
begin
  select * into v_run from challenge_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'challenge_run % not found', p_run_id;
  end if;
  if v_run.status <> 'finalized' then
    raise exception 'challenge_run % is not finalized (status=%)', p_run_id, v_run.status;
  end if;

  if v_run.season_id is not null then
    insert into player_season_stats (user_id, season_id, total_runs, completed_runs, updated_at)
    values (v_run.created_by, v_run.season_id, 1, 1, now())
    on conflict (user_id, season_id) do update
      set total_runs = player_season_stats.total_runs + 1,
          completed_runs = player_season_stats.completed_runs + 1,
          updated_at = now();
  end if;

  insert into player_lifetime_stats (user_id, total_runs, completed_runs, updated_at)
  values (v_run.created_by, 1, 1, now())
  on conflict (user_id) do update
    set total_runs = player_lifetime_stats.total_runs + 1,
        completed_runs = player_lifetime_stats.completed_runs + 1,
        updated_at = now();

  if v_run.weekly_challenge_id is not null then
    insert into player_weekly_stats (user_id, weekly_challenge_id, season_id, runs, best_score, clears, updated_at)
    values (v_run.created_by, v_run.weekly_challenge_id, v_run.season_id, 1, v_run.score, 1, now())
    on conflict (user_id, weekly_challenge_id) do update
      set runs = player_weekly_stats.runs + 1,
          best_score = greatest(coalesce(player_weekly_stats.best_score, 0), coalesce(v_run.score, 0)),
          clears = player_weekly_stats.clears + 1,
          updated_at = now();
  end if;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table badges enable row level security;
alter table player_badges enable row level security;
alter table player_season_stats enable row level security;
alter table player_weekly_stats enable row level security;
alter table player_lifetime_stats enable row level security;

-- Badge catalog is the public "what can I earn" reference.
create policy "public read active badges" on badges
  for select using (is_active and not is_hidden);

-- Earned badges + aggregated stats are profile/leaderboard display data —
-- public read, service-role-only write (never client-submitted).
create policy "public read player_badges" on player_badges for select using (true);
create policy "public read player_season_stats" on player_season_stats for select using (true);
create policy "public read player_weekly_stats" on player_weekly_stats for select using (true);
create policy "public read player_lifetime_stats" on player_lifetime_stats for select using (true);
