-- Preserve the playlist identity that Bungie separates from the map activity.
-- Competitive Clash currently reports generic Quickplay/Clash mode markers;
-- director activity 814159553 is the authoritative Competitive playlist.

alter table crucible_matches
  add column if not exists director_activity_hash bigint;

create index if not exists crucible_matches_director_activity_hash_idx
  on crucible_matches(director_activity_hash);

alter table game_sessions
  add column if not exists pgcr_instance_id text;

create index if not exists game_sessions_pgcr_instance_idx
  on game_sessions(pgcr_instance_id);

update crucible_matches as matches
set director_activity_hash = extracted.director_hash
from (
  select
    instance_id,
    coalesce(
      raw_pgcr #>> '{activityDetails,directorActivityHash}',
      raw_pgcr #>> '{Response,activityDetails,directorActivityHash}'
    )::bigint as director_hash
  from pgcr_cache
  where coalesce(
    raw_pgcr #>> '{activityDetails,directorActivityHash}',
    raw_pgcr #>> '{Response,activityDetails,directorActivityHash}'
  ) ~ '^[0-9]+$'
) as extracted
where matches.instance_id = extracted.instance_id
  and matches.director_activity_hash is distinct from extracted.director_hash;

update crucible_matches
set mode_bucket = 'competitive', updated_at = now()
where director_activity_hash = 814159553
  and mode_bucket <> 'competitive';

update crucible_encounters as encounters
set mode_bucket = 'competitive'
from crucible_matches as matches
where encounters.instance_id = matches.instance_id
  and matches.director_activity_hash = 814159553
  and encounters.mode_bucket <> 'competitive';
