-- 062: Drop Endgame Roulette (core-slim plan).
--
-- The endgame PvE randomizer (app/endgame, lib/endgame, the "ironman" mode
-- card, and the "endgame" lobby mode) was removed alongside this migration.
--
-- Note: 042's lobby_endgame_rounds / lobby_endgame_exotic_picks were never
-- applied to the live database (verified 2026-07-14), so the drops below are
-- no-ops there; they exist for any environment where 042 did run. The live
-- lobbies table had zero mode='endgame' rows at tightening time.

drop table if exists lobby_endgame_exotic_picks;
drop table if exists lobby_endgame_rounds;

-- Remove any endgame lobbies (children cascade), then narrow the mode check.
delete from lobbies where mode = 'endgame';

alter table lobbies drop constraint if exists lobbies_mode_check;
alter table lobbies
  add constraint lobbies_mode_check check (mode in ('roulette', 'draft'));
