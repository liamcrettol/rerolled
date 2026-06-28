-- supabase/migrations/020_lobby_members_clan.sql
-- Persist each member's clan so the Roll Comparison nameplate can show it
-- (issue #152). Populated best-effort from Bungie GetGroupsForMember on ready.
alter table lobby_members
  add column if not exists clan_name text,
  add column if not exists clan_tag text;
