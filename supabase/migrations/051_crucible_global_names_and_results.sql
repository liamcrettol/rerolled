-- Prefer Bungie's cross-platform global display name over a stale platform
-- account name, and finish the historical win/loss backfill from cached PGCRs.

with pgcr_players as (
  select
    c.instance_id,
    entry->'player'->'destinyUserInfo'->>'membershipId' as membership_id,
    coalesce(
      nullif(entry->'player'->'destinyUserInfo'->>'bungieGlobalDisplayName', ''),
      nullif(entry->'player'->'destinyUserInfo'->>'displayName', '')
    ) as display_name,
    coalesce(
      entry->'values'->'standing'->'basic'->>'value',
      entry->>'standing'
    ) as standing
  from pgcr_cache c
  cross join lateral jsonb_array_elements(c.raw_pgcr->'entries') entry
)
update crucible_match_players player
set
  display_name = coalesce(pgcr.display_name, player.display_name),
  is_win = case pgcr.standing
    when '0' then true
    when '1' then false
    else player.is_win
  end,
  updated_at = now()
from pgcr_players pgcr
where pgcr.instance_id = player.instance_id
  and pgcr.membership_id = player.membership_id
  and (
    (pgcr.display_name is not null and player.display_name is distinct from pgcr.display_name)
    or (player.is_win is null and pgcr.standing in ('0', '1'))
  );

update crucible_encounters encounter
set
  opponent_display_name = player.display_name,
  viewer_won = viewer.is_win
from crucible_match_players player,
     crucible_match_players viewer
where player.instance_id = encounter.instance_id
  and player.membership_id = encounter.opponent_membership_id
  and viewer.instance_id = encounter.instance_id
  and viewer.membership_id = encounter.viewer_membership_id
  and (
    encounter.opponent_display_name is distinct from player.display_name
    or (encounter.viewer_won is null and viewer.is_win is not null)
  );
