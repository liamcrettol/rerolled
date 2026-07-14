-- 060: Drop the badge system (core-slim plan, Phase 1).
--
-- Badge display was removed from the app alongside this migration (lib/badges,
-- components/badges, /badges page, and the badge props on PlayerCard/TopNav/
-- RollDetails/LobbyRoom). The award pipeline was already deleted in 059.
-- This drops the storage: badges + player_badges (030, extended 036-051),
-- the founder auto-grant trigger (051), and the dead stats upsert helper
-- from 030 whose only caller was the deleted worker.

drop trigger if exists users_auto_grant_founder on users;
drop function if exists grant_founder_badge_to_user();
drop function if exists upsert_player_stats_after_run(uuid);

drop table if exists player_badges;
drop table if exists badges;
