-- ============================================================
-- 025 - Challenge platform: seasons + weekly challenge definitions
-- ============================================================
-- Foundation tables for the challenge platform (see #259). Additive only —
-- does not touch existing lobby/roulette/auth tables.
--
-- `btree_gist` backs the exclusion constraint that stops two "active" weekly
-- challenges from overlapping in time.
create extension if not exists btree_gist;

-- ============================================================
-- SEASONS
-- ============================================================
create table if not exists seasons (
  id uuid primary key default uuid_generate_v4(),
  season_key text not null unique,          -- e.g. "2026-summer" or a Destiny season identifier
  display_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'ended', 'archived')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

-- Only one season may be "active" at a time.
create unique index if not exists seasons_one_active_idx
  on seasons ((true))
  where status = 'active';

-- ============================================================
-- WEEKLY CHALLENGES
-- ============================================================
create table if not exists weekly_challenges (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references seasons(id),
  week_number integer not null,
  title text not null,
  slug text not null unique,
  description text,
  activity_hash bigint,
  activity_name_snapshot text,
  activity_mode integer,
  activity_family text
    check (activity_family in ('gm', 'nightfall', 'dungeon', 'raid', 'vanguard', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'active', 'expired', 'archived')),
  global_seed text not null,
  rules jsonb not null default '[]'::jsonb,
  scoring_config jsonb,
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, week_number),
  check (starts_at < ends_at),
  -- Scheduled/active/expired challenges are past the draft stage and must be
  -- fully specified (see lib/challenges/validate.ts for the pre-publish check
  -- this mirrors).
  check (
    status not in ('scheduled', 'active', 'expired')
    or (
      published_at is not null
      and activity_hash is not null
      and scoring_config is not null
      and jsonb_typeof(rules) = 'array'
      and jsonb_array_length(rules) > 0
    )
  )
);

create index if not exists weekly_challenges_season_idx on weekly_challenges(season_id);
create index if not exists weekly_challenges_status_idx on weekly_challenges(status);

-- No two "active" weekly challenges may have overlapping [starts_at, ends_at)
-- windows. Partial exclusion constraint — only rows with status = 'active'
-- participate.
alter table weekly_challenges
  drop constraint if exists weekly_challenges_no_overlapping_active;
alter table weekly_challenges
  add constraint weekly_challenges_no_overlapping_active
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'active');

-- ============================================================
-- WEEKLY CHALLENGE VERSIONS
-- ============================================================
-- Immutable snapshot taken at publish time. challenge_runs references a
-- specific version so edits to a still-draft challenge (or a later
-- archive/replace) never retroactively change the rules a run was scored
-- against.
create table if not exists weekly_challenge_versions (
  id uuid primary key default uuid_generate_v4(),
  weekly_challenge_id uuid not null references weekly_challenges(id) on delete cascade,
  version_number integer not null,
  title text not null,
  activity_hash bigint,
  activity_name_snapshot text,
  rules jsonb not null,
  scoring_config jsonb not null,
  snapshot_taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (weekly_challenge_id, version_number)
);

create index if not exists weekly_challenge_versions_challenge_idx
  on weekly_challenge_versions(weekly_challenge_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table seasons enable row level security;
alter table weekly_challenges enable row level security;
alter table weekly_challenge_versions enable row level security;

-- Seasons are pure metadata (name/date range), safe to read publicly.
create policy "public read seasons" on seasons for select using (true);

-- Only published-or-later challenges are publicly visible; drafts stay
-- server-side (service role bypasses RLS entirely for authoring).
create policy "public read published weekly_challenges" on weekly_challenges
  for select using (status <> 'draft');

create policy "public read weekly_challenge_versions" on weekly_challenge_versions
  for select using (
    exists (
      select 1 from weekly_challenges wc
      where wc.id = weekly_challenge_versions.weekly_challenge_id
        and wc.status <> 'draft'
    )
  );
