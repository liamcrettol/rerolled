-- supabase/migrations/018_lobby_members_emblem.sql
alter table lobby_members
  add column if not exists emblem_path text,
  add column if not exists emblem_background_path text;
