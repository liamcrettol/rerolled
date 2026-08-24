-- 069 - Index lobby_members(user_id).
-- getActiveSessionForUser() (lib/lobby/index.ts) filters lobby_members by
-- user_id on every dashboard load. The only existing index on this table
-- (lobby_members_lobby_idx, 001_initial.sql) and its unique constraint both
-- lead with lobby_id, so a user_id-only lookup can't use either. Lobbies are
-- only ever soft-closed (status='done'), never deleted, so this table grows
-- unbounded per active user and the dashboard load gets a sequential scan
-- that slows down over the app's lifetime.
--
-- Found during the 2026-08-24 scheduled production health audit.

create index if not exists lobby_members_user_idx on lobby_members(user_id);
