-- ============================================================
-- 040 - Trials passage snapshots for rerolled card badges
-- ============================================================
-- Stores pre-match and post-match snapshots of any Trials passage items seen
-- on a run owner's profile. The badge layer derives a "card" context
-- (wins/flawless/complete + idempotency scope) by comparing these snapshots,
-- instead of inventing card grouping from PGCR data that does not exist.

create table if not exists run_trials_passage_snapshots (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  user_id text not null references users(id),
  bungie_membership_id text,
  capture_phase text not null
    check (capture_phase in ('pre_match', 'post_match')),
  passage_instance_id text not null,
  passage_item_hash bigint not null,
  passage_name text,
  bucket_hash bigint,
  character_id text,
  wins integer not null default 0,
  rounds_won integer not null default 0,
  active_win_streak integer not null default 0,
  flawless_win_streak integer not null default 0,
  flawless_progress integer,
  is_flawless boolean not null default false,
  is_complete boolean not null default false,
  trials_multiplier integer,
  raw_objectives jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (run_id, user_id, capture_phase, passage_instance_id)
);

create index if not exists run_trials_passage_snapshots_run_phase_idx
  on run_trials_passage_snapshots(run_id, capture_phase, captured_at desc);

create index if not exists run_trials_passage_snapshots_user_idx
  on run_trials_passage_snapshots(user_id, captured_at desc);

alter table run_trials_passage_snapshots enable row level security;

-- Worker-only internal snapshots, same posture as run_legality_results.
