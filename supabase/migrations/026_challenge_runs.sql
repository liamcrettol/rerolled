-- ============================================================
-- 026 - Challenge platform: runs, participants, loadout slots
-- ============================================================
-- A "challenge_run" is one attempt at either Score Attack or a weekly
-- challenge. Status values mirror lib/scoreAttack/runLifecycle.ts
-- (ScoreAttackRunState) so the worker's pure state-machine logic maps
-- directly onto this column — keep the two in sync if either changes.

create table if not exists challenge_runs (
  id uuid primary key default uuid_generate_v4(),
  mode text not null check (mode in ('score_attack', 'weekly_challenge')),
  status text not null default 'created'
    check (status in (
      'created', 'loadout_rolled', 'applied', 'in_activity',
      'completed_pending_pgcr', 'pgcr_fetched', 'parsed', 'scored',
      'finalized', 'failed', 'abandoned', 'expired'
    )),
  weekly_challenge_id uuid references weekly_challenges(id),
  weekly_challenge_version_id uuid references weekly_challenge_versions(id),
  season_id uuid references seasons(id),
  lobby_id uuid references lobbies(id),
  round_id uuid references lobby_rounds(id),
  activity_hash bigint,
  pgcr_instance_id text,
  started_at timestamptz,
  completed_at timestamptz,
  finalized_at timestamptz,
  score numeric,
  scoring_breakdown jsonb,
  compliance_status text check (compliance_status in ('eligible', 'flagged', 'ineligible', 'unknown')),
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A weekly-challenge run must point at the challenge (and the version it
  -- started against); a score-attack run has no weekly challenge at all.
  check (
    (mode = 'weekly_challenge' and weekly_challenge_id is not null and weekly_challenge_version_id is not null)
    or (mode = 'score_attack' and weekly_challenge_id is null)
  ),
  -- Can't finalize without a score/compliance verdict, unless the run never
  -- got that far (abandoned/expired short-circuit the pipeline).
  check (
    status <> 'finalized'
    or (score is not null and compliance_status is not null)
  )
);

create index if not exists challenge_runs_weekly_challenge_idx on challenge_runs(weekly_challenge_id);
create index if not exists challenge_runs_season_idx on challenge_runs(season_id);
create index if not exists challenge_runs_status_idx on challenge_runs(status);
create index if not exists challenge_runs_created_by_idx on challenge_runs(created_by);
create index if not exists challenge_runs_pgcr_instance_idx on challenge_runs(pgcr_instance_id);

-- ============================================================
-- CHALLENGE RUN PARTICIPANTS
-- ============================================================
create table if not exists challenge_run_participants (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  user_id text not null references users(id),
  bungie_membership_id text not null,
  bungie_membership_type integer,
  character_id text,
  is_owner boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (run_id, user_id)
);

create index if not exists challenge_run_participants_run_idx on challenge_run_participants(run_id);
create index if not exists challenge_run_participants_user_idx on challenge_run_participants(user_id);

-- ============================================================
-- CHALLENGE RUN LOADOUT SLOTS
-- ============================================================
-- The server-rolled 3-slot loadout for this run. Mirrors lobby_loadout_slots'
-- shape so the roulette engine's output maps onto both tables the same way.
create table if not exists challenge_run_loadout_slots (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  slot text not null check (slot in ('kinetic', 'energy', 'power')),
  item_hash bigint not null,
  weapon_name text not null,
  weapon_icon text,
  weapon_type text,
  damage_type text,
  is_wildcard boolean not null default false,
  reroll_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, slot)
);

create index if not exists challenge_run_loadout_slots_run_idx on challenge_run_loadout_slots(run_id);

-- Immutability: once the parent run has reached a terminal state, its rolled
-- loadout slots can no longer be changed (rerolls only make sense pre-finalize).
create or replace function prevent_finalized_run_loadout_mutation()
returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from challenge_runs where id = old.run_id;
  if v_status in ('finalized', 'failed', 'abandoned', 'expired') then
    raise exception 'challenge_run_loadout_slots is immutable once run % has reached status %', old.run_id, v_status;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_run_loadout_slots_immutable on challenge_run_loadout_slots;
create trigger challenge_run_loadout_slots_immutable
  before update or delete on challenge_run_loadout_slots
  for each row execute function prevent_finalized_run_loadout_mutation();

-- ============================================================
-- CHALLENGE RUN EVENTS (audit trail)
-- ============================================================
create table if not exists challenge_run_events (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists challenge_run_events_run_created_idx
  on challenge_run_events(run_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Runs contain per-player performance data ahead of leaderboard publication
-- and are driven entirely by server routes / the worker (service role).
-- Same posture as `users`/`bungie_accounts` in 001_initial.sql: RLS enabled,
-- no anon/authenticated policies, so only the service role can read or write.
alter table challenge_runs enable row level security;
alter table challenge_run_participants enable row level security;
alter table challenge_run_loadout_slots enable row level security;
alter table challenge_run_events enable row level security;
