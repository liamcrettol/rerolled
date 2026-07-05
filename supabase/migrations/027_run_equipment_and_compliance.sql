-- ============================================================
-- 027 - Equipment snapshots + compliance results
-- ============================================================
-- Feeds lib/scoreAttack/compliance.ts (RunEligibilityInput/RunEligibilityResult).
-- Snapshots are periodic captures of what a player has equipped during a run;
-- compliance results are the finalized verdict computed from them plus PGCR
-- weapon-kill data.

create table if not exists run_equipment_snapshots (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  user_id text references users(id),
  bungie_membership_id text,
  bungie_membership_type integer,
  character_id text,
  captured_at timestamptz not null default now(),
  -- EquipmentSnapshotWeapon[]: [{ slot, weaponHash, itemHash, itemInstanceId, weaponType }]
  equipped jsonb not null,
  -- RolledWeaponExpectation[] active at capture time, kept alongside the
  -- snapshot so a later audit doesn't need to reconstruct it from history.
  expected jsonb,
  created_at timestamptz not null default now()
);

create index if not exists run_equipment_snapshots_run_captured_idx
  on run_equipment_snapshots(run_id, captured_at);
create index if not exists run_equipment_snapshots_run_user_idx
  on run_equipment_snapshots(run_id, user_id);

create table if not exists run_compliance_results (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  user_id text references users(id),
  bungie_membership_id text,
  status text not null check (status in ('eligible', 'flagged', 'ineligible', 'unknown')),
  weapon_usage_ratio numeric,
  off_loadout_snapshot_rate numeric,
  -- string[] of human-readable reasons, matches
  -- WeaponUsageComplianceResult/SnapshotComplianceResult.reasons.
  reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id)
);

create index if not exists run_compliance_results_run_idx on run_compliance_results(run_id);
create index if not exists run_compliance_results_status_idx on run_compliance_results(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Raw equipment snapshots and compliance reasoning are never shown directly
-- to players (only the summarized compliance_status on leaderboard rows is
-- public — see 029_leaderboards.sql). Service-role-only, same posture as
-- challenge_runs.
alter table run_equipment_snapshots enable row level security;
alter table run_compliance_results enable row level security;
