-- ============================================================
-- 047 - Weekly challenges: pillar (PvE / PvP) support
-- ============================================================
-- Adds a `pillar` column to weekly_challenges so a PvP-focused weekly track
-- can run alongside the existing PvE one, and repartitions the two
-- constraints that previously assumed a single global track (#296).
--
-- `btree_gist` is already enabled by 025, but `create extension if not
-- exists` is idempotent and keeps this migration self-contained.
create extension if not exists btree_gist;

alter table weekly_challenges
  add column if not exists pillar text not null default 'pve';

alter table weekly_challenges drop constraint if exists weekly_challenges_pillar_check;
alter table weekly_challenges add constraint weekly_challenges_pillar_check
  check (pillar in ('pve', 'pvp'));

-- Replace the old 2-column unique constraint with a pillar-partitioned one.
-- Looked up by its actual definition rather than a guessed auto-generated
-- name, so this is safe regardless of what Postgres happened to name it.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'weekly_challenges'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (season_id, week_number)'
  loop
    execute format('alter table weekly_challenges drop constraint %I', c.conname);
  end loop;
end $$;

alter table weekly_challenges drop constraint if exists weekly_challenges_season_week_pillar_key;
alter table weekly_challenges add constraint weekly_challenges_season_week_pillar_key
  unique (season_id, week_number, pillar);

-- Replace the no-overlapping-active exclusion constraint with a
-- pillar-partitioned one, so a PvE and a PvP challenge can be "active"
-- with the same (or overlapping) [starts_at, ends_at) window.
alter table weekly_challenges drop constraint if exists weekly_challenges_no_overlapping_active;
alter table weekly_challenges add constraint weekly_challenges_no_overlapping_active
  exclude using gist (pillar with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'active');

create index if not exists weekly_challenges_pillar_idx on weekly_challenges(pillar);
