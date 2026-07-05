-- ============================================================
-- 028 - PGCR cache + worker job queue
-- ============================================================
-- `job_type` is intentionally a plain text column (not a check constraint)
-- so lib/scoreAttack/types.ts's SCORE_ATTACK_JOB_TYPES can grow without a
-- migration; keep the two lists in sync in review.
--
-- Column names mirror lib/scoreAttack/worker/jobs.ts's ScoreAttackJob shape
-- (camelCase -> snake_case: runAt -> run_at, dedupeKey -> dedupe_key, ...) so
-- a Supabase-backed queue adapter can map 1:1 onto this table.

create table if not exists pgcr_cache (
  instance_id text primary key,
  source text not null default 'bungie_api',
  raw_pgcr jsonb,
  normalized_pgcr jsonb,
  fetched_at timestamptz,
  expires_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'fetched', 'normalized', 'failed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pgcr_cache_status_idx on pgcr_cache(status);
create index if not exists pgcr_cache_expires_at_idx on pgcr_cache(expires_at);

create table if not exists worker_jobs (
  id uuid primary key default uuid_generate_v4(),
  job_type text not null,
  run_id uuid references challenge_runs(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  dedupe_key text unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_jobs_status_run_at_idx on worker_jobs(status, run_at);
create index if not exists worker_jobs_locked_until_idx on worker_jobs(locked_until);
create index if not exists worker_jobs_type_status_idx on worker_jobs(job_type, status);

create table if not exists run_processing_events (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  job_id uuid references worker_jobs(id) on delete set null,
  event_type text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists run_processing_events_run_created_idx
  on run_processing_events(run_id, created_at);

-- ============================================================
-- WORKER JOB CLAIMING (concurrency-safe)
-- ============================================================
-- FOR UPDATE SKIP LOCKED lets N worker processes call this concurrently
-- without double-claiming the same job.
create or replace function claim_next_worker_job(p_worker_id text, p_lock_seconds integer default 60)
returns worker_jobs
language plpgsql as $$
declare
  v_job worker_jobs;
begin
  select * into v_job
  from worker_jobs
  where status = 'pending'
    and run_at <= now()
  order by run_at
  limit 1
  for update skip locked;

  if v_job.id is null then
    return null;
  end if;

  update worker_jobs
  set status = 'running',
      attempts = attempts + 1,
      locked_by = p_worker_id,
      locked_until = now() + make_interval(secs => p_lock_seconds),
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function complete_worker_job(p_job_id uuid)
returns worker_jobs
language plpgsql as $$
declare
  v_job worker_jobs;
begin
  update worker_jobs
  set status = 'completed',
      locked_by = null,
      locked_until = null,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function fail_worker_job(p_job_id uuid, p_error text, p_next_run_at timestamptz default null)
returns worker_jobs
language plpgsql as $$
declare
  v_job worker_jobs;
begin
  select * into v_job from worker_jobs where id = p_job_id;
  if v_job.id is null then
    return null;
  end if;

  update worker_jobs
  set status = case when v_job.attempts >= v_job.max_attempts then 'failed' else 'pending' end,
      run_at = coalesce(p_next_run_at, now() + make_interval(secs => 30 * v_job.attempts)),
      last_error = p_error,
      locked_by = null,
      locked_until = null,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Worker internals — never touched by browser clients directly.
alter table pgcr_cache enable row level security;
alter table worker_jobs enable row level security;
alter table run_processing_events enable row level security;
