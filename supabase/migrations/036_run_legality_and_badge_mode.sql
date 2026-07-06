-- ============================================================
-- 036 - Rerolled badge layer: strict legality + activity_family/badge mode
-- ============================================================
-- Adds the data model needed for the "Rerolled" badge set (Crucible/Trials/
-- Iron Banner/PvE, see project design notes). Two additive pieces:
--
-- 1. run_legality_results: a STRICT zero-tolerance pass/fail, distinct from
--    the existing ratio-based run_compliance_results (027). Badges require
--    zero illegal final blows; the ratio model (>=70% eligible) stays as-is
--    for score attack/weekly challenge leaderboard placement.
-- 2. badges.mode: which Badge Case tab a badge belongs to. Orthogonal to the
--    existing `category` column (badge nature: completion/performance/etc.)
--    and `tier` (bronze..special, doubles as the rarity border treatment).
--
-- Crucible/Trials/Iron Banner activity_family values are added now so weekly
-- challenges and badge criteria can reference them; the PvP PGCR normalizer
-- and worker wiring needed to actually populate runs for these families is
-- separate follow-up work (lib/scoreAttack/pgcr.ts currently rejects PvP
-- PGCRs outright — see parsePvEPgcr's "pvp_pgcr" unsupportedReason).

-- ============================================================
-- ACTIVITY FAMILY: add PvP families
-- ============================================================
alter table weekly_challenges drop constraint if exists weekly_challenges_activity_family_check;
alter table weekly_challenges add constraint weekly_challenges_activity_family_check
  check (activity_family in ('gm', 'nightfall', 'dungeon', 'raid', 'vanguard', 'crucible', 'trials', 'iron_banner', 'other'));

-- ============================================================
-- BADGES: mode column (Badge Case tab grouping)
-- ============================================================
alter table badges add column if not exists mode text
  check (mode in ('core', 'crucible', 'trials', 'iron_banner', 'pve', 'status_legacy'));

create index if not exists badges_mode_idx on badges(mode);

-- ============================================================
-- RUN LEGALITY RESULTS (strict, badge-only)
-- ============================================================
create table if not exists run_legality_results (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references challenge_runs(id) on delete cascade,
  user_id text references users(id),
  is_valid boolean not null,
  had_active_loadout boolean not null default false,
  rolled_final_blows integer not null default 0,
  illegal_final_blows integer not null default 0,
  -- string[]: "melee" | "grenade" | "super" | "ability" | "off_roll_weapon:<hash>"
  illegal_sources jsonb not null default '[]'::jsonb,
  -- bigint[]: rolled weaponHashes with >=1 final blow this run (Threefold/No Reserve)
  rolled_weapons_used jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (run_id, user_id)
);

create index if not exists run_legality_results_run_idx on run_legality_results(run_id);
create index if not exists run_legality_results_user_valid_idx on run_legality_results(user_id, is_valid);

alter table run_legality_results enable row level security;

-- Same posture as run_compliance_results: raw legality reasoning is never
-- shown directly to other players. The owning user's own history (including
-- private "Forfeit" markers) is read through a service-role API route, not
-- direct client select.
