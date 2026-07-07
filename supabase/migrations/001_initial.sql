-- ============================================================
-- Rerolled - Initial Schema
-- Run this in Supabase SQL Editor or via psql
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
create table if not exists users (
  id text primary key,                   -- Bungie membershipId (string)
  display_name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- BUNGIE ACCOUNTS (stores encrypted OAuth tokens)
-- ============================================================
create table if not exists bungie_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null references users(id) on delete cascade,
  membership_id text not null,
  membership_type integer not null,
  access_token_enc text not null,        -- AES-256-GCM encrypted
  refresh_token_enc text,
  expires_at timestamptz,
  updated_at timestamptz default now(),
  unique (user_id)
);

-- ============================================================
-- CACHED MANIFEST METADATA
-- ============================================================
create table if not exists cached_manifest_metadata (
  version text primary key,
  items_json jsonb not null,
  stats_json jsonb not null,
  damage_types_json jsonb not null,
  sandbox_perks_json jsonb not null,
  cached_at timestamptz default now()
);

-- ============================================================
-- LOBBIES
-- ============================================================
create table if not exists lobbies (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  host_user_id text not null references users(id),
  captain_user_id text not null references users(id),
  status text not null default 'waiting'
    check (status in ('waiting', 'rolling', 'applying', 'done')),
  current_round integer not null default 1,
  created_at timestamptz default now()
);

create index if not exists lobbies_code_idx on lobbies(code);

-- ============================================================
-- LOBBY MEMBERS
-- ============================================================
create table if not exists lobby_members (
  id uuid primary key default uuid_generate_v4(),
  lobby_id uuid not null references lobbies(id) on delete cascade,
  user_id text not null references users(id),
  display_name text not null,
  bungie_membership_type integer not null,
  bungie_membership_id text not null,
  selected_character_id text,
  is_ready boolean not null default false,
  is_captain boolean not null default false,
  joined_at timestamptz default now(),
  unique (lobby_id, user_id)
);

create index if not exists lobby_members_lobby_idx on lobby_members(lobby_id);

-- ============================================================
-- LOBBY ROUNDS
-- ============================================================
create table if not exists lobby_rounds (
  id uuid primary key default uuid_generate_v4(),
  lobby_id uuid not null references lobbies(id) on delete cascade,
  round_number integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'locked', 'applied')),
  created_at timestamptz default now(),
  unique (lobby_id, round_number)
);

-- ============================================================
-- LOBBY LOADOUT SLOTS (the 3 weapons per round)
-- ============================================================
create table if not exists lobby_loadout_slots (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references lobby_rounds(id) on delete cascade,
  slot text not null check (slot in ('kinetic', 'energy', 'power')),
  item_hash bigint not null,
  weapon_name text not null,
  weapon_icon text not null,
  weapon_type text not null,
  damage_type text not null,
  locked_by_user_id text references users(id),
  created_at timestamptz default now(),
  unique (round_id, slot)
);

-- ============================================================
-- ROLL HISTORY
-- ============================================================
create table if not exists roll_history (
  id uuid primary key default uuid_generate_v4(),
  lobby_id uuid not null references lobbies(id) on delete cascade,
  round_id uuid not null references lobby_rounds(id),
  round_number integer not null,
  applied_at timestamptz,
  apply_results jsonb,                   -- ApplyResult[] JSON
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- NOTE: We use the service role key server-side, so RLS is
-- advisory here. Enable anon read for lobby code lookups only.
-- ============================================================
alter table lobbies enable row level security;
alter table lobby_members enable row level security;
alter table lobby_rounds enable row level security;
alter table lobby_loadout_slots enable row level security;
alter table roll_history enable row level security;
alter table users enable row level security;
alter table bungie_accounts enable row level security;
alter table cached_manifest_metadata enable row level security;

-- Service role bypasses all RLS - all writes go through service role server-side.
-- Anon users can read lobby info (for the realtime subscription in browser).
create policy "anon read lobbies" on lobbies for select using (true);
create policy "anon read lobby_members" on lobby_members for select using (true);
create policy "anon read lobby_rounds" on lobby_rounds for select using (true);
create policy "anon read lobby_loadout_slots" on lobby_loadout_slots for select using (true);
create policy "anon read roll_history" on roll_history for select using (true);

-- Realtime: enable for lobby-related tables
alter publication supabase_realtime add table lobby_members;
alter publication supabase_realtime add table lobby_loadout_slots;
alter publication supabase_realtime add table lobby_rounds;
alter publication supabase_realtime add table lobbies;
