-- ============================================================
-- 005 — Per-weapon kill tracking for Hall of Fame
-- ============================================================

create table if not exists weapon_round_kills (
  id uuid primary key default uuid_generate_v4(),
  game_session_id uuid not null references game_sessions(id) on delete cascade,
  item_hash bigint not null,
  total_kills integer not null default 0
);

create index if not exists weapon_round_kills_hash_idx on weapon_round_kills(item_hash);
create index if not exists weapon_round_kills_session_idx on weapon_round_kills(game_session_id);

alter table weapon_round_kills enable row level security;
create policy "anon read weapon_round_kills" on weapon_round_kills for select using (true);
