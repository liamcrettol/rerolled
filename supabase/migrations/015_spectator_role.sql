alter table lobby_members
  add column if not exists is_spectator boolean not null default false;
