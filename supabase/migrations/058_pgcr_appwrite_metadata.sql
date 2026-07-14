-- ============================================================
-- 058 - Appwrite archive metadata for pgcr_cache
-- ============================================================
-- Bookkeeping for the raw_pgcr -> Appwrite Storage archive (docs/pgcr-archive.md).
-- Appwrite's file ID is deterministically the row's instance_id, so no
-- appwrite_file_id column is needed - the mapping is implicit.
--
-- raw_pgcr itself is untouched by this migration and keeps being the durable
-- outbox copy until a row is verified in Appwrite (appwrite_migrated_at set)
-- and, separately, explicitly cleared.

alter table public.pgcr_cache
  add column if not exists appwrite_sha256 text,
  add column if not exists appwrite_bytes bigint,
  add column if not exists appwrite_migrated_at timestamptz,
  add column if not exists appwrite_last_verified_at timestamptz;

-- ARCHIVE queue: rows that still hold a raw payload and have never been
-- verified in Appwrite. Backs the historical migration script and the
-- archive-mode reconciliation sweep.
create index if not exists pgcr_cache_unarchived_idx
  on public.pgcr_cache (instance_id)
  where raw_pgcr is not null and appwrite_migrated_at is null;

-- CLEAR queue: rows that have ALREADY been verified in Appwrite (so a real
-- appwrite_sha256 is on file) but still hold their raw payload. Deliberately
-- disjoint from pgcr_cache_unarchived_idx above - a row moves from one queue
-- to the other the moment it's archived, and this is what the clear-mode
-- reconciliation sweep scans. Rows migrated in a prior run (including by
-- scripts/migrate-pgcr-to-appwrite.mjs) are visible here immediately, unlike
-- an earlier draft of this feature that only ever selected
-- appwrite_migrated_at IS NULL rows and could never reach them.
create index if not exists pgcr_cache_uncleared_idx
  on public.pgcr_cache (instance_id)
  where raw_pgcr is not null and appwrite_migrated_at is not null and appwrite_sha256 is not null;

-- ============================================================
-- ATOMIC, CONCURRENCY-SAFE METADATA STAMP (+ OPTIONAL CLEAR)
-- ============================================================
-- Single guarded UPDATE, run as one statement/transaction: recomputes
-- SHA-256 over the row's CURRENT raw_pgcr content and only stamps
-- appwrite_* metadata - and, if p_clear_raw, nulls raw_pgcr in the very same
-- update - when that hash matches p_expected_sha256 (the checksum the
-- caller verified against Appwrite moments earlier, whether that caller is
-- the live app, the historical migration script, or the reconciliation
-- sweep). If raw_pgcr was rewritten by a concurrent write in between the
-- caller's read/verify and this call, the hash no longer matches, the
-- update touches 0 rows, and this returns false - the caller must NOT
-- report the row as archived/cleared, and the row (now holding its new
-- content) is naturally picked up again by the next sweep.
--
-- IMPORTANT: raw_pgcr is jsonb, not bytea - `raw_pgcr::bytea` is not a valid
-- Postgres cast. The checksum must be computed over the UTF-8 bytes of the
-- jsonb's *text* rendering: convert_to(raw_pgcr::text, 'UTF8'). This must
-- match exactly what lib/pgcr/service.ts and scripts/lib/pgcrArchiveCore.mjs
-- compute their own checksums from (a plain `select raw_pgcr::text`), so
-- "the bytes" has one definition everywhere - not a per-caller
-- reimplementation prone to drifting apart.
--
-- appwrite_migrated_at is preserved via coalesce() so it always reflects the
-- FIRST time a row was verified, even though this function may be called
-- again later purely to bump appwrite_last_verified_at or to clear. Byte
-- length and both timestamps are database-derived: callers supply only the
-- instance ID, the checksum they independently verified against Appwrite,
-- and whether this same guarded update should clear the raw payload.
--
-- Remove the five-argument signature from the earlier, unapplied draft if it
-- was installed while testing. CREATE OR REPLACE cannot change argument
-- types, so an explicit DROP prevents the old and hardened RPCs coexisting as
-- overloads. No production migration has depended on the draft signature.
drop function if exists public.mark_pgcr_archived_if_current(text, text, bigint, timestamptz, boolean);

create or replace function public.mark_pgcr_archived_if_current(
  p_instance_id bigint,
  p_expected_sha256 text,
  p_clear_raw boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Refuse malformed input before touching durable data. Appwrite/Supabase
  -- SHA-256 values are canonical lowercase hexadecimal strings.
  if p_instance_id is null
     or p_expected_sha256 is null
     or p_expected_sha256 !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.pgcr_cache
  set appwrite_sha256 = encode(sha256(convert_to(raw_pgcr::text, 'UTF8')), 'hex'),
      appwrite_bytes = octet_length(convert_to(raw_pgcr::text, 'UTF8')),
      appwrite_migrated_at = coalesce(appwrite_migrated_at, statement_timestamp()),
      appwrite_last_verified_at = statement_timestamp(),
      raw_pgcr = case when coalesce(p_clear_raw, false) then null else raw_pgcr end
  where instance_id = p_instance_id::text
    and raw_pgcr is not null
    and encode(sha256(convert_to(raw_pgcr::text, 'UTF8')), 'hex') = p_expected_sha256;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.mark_pgcr_archived_if_current(bigint, text, boolean) from public;
grant execute on function public.mark_pgcr_archived_if_current(bigint, text, boolean) to service_role;
