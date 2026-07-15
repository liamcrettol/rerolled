-- 063: Persistent no-repeat weapon cycles for Roulette.
--
-- One row means the weapon has appeared in the lobby's current cycle for that
-- slot. The roll API clears a slot only after every currently eligible weapon
-- has appeared. Lobby deletion cascades the entire cycle automatically.

create table if not exists public.lobby_weapon_usage (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  slot text not null check (slot in ('kinetic', 'energy', 'power')),
  item_hash bigint not null,
  used_at timestamptz not null default now(),
  primary key (lobby_id, slot, item_hash)
);

create index if not exists lobby_weapon_usage_recent_idx
  on public.lobby_weapon_usage (lobby_id, slot, used_at desc);

alter table public.lobby_weapon_usage enable row level security;

-- All access is server-side through the service role. Do not add anon policies.
