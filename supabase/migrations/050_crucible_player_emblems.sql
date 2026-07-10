-- Persist the emblem/icon exposed by each PGCR player entry for match reports.
alter table crucible_match_players
  add column if not exists emblem_path text;

-- Backfill rows from cached PGCR payloads without making new Bungie requests.
update crucible_match_players p
set emblem_path = coalesce(
  nullif(entry.value->'player'->'destinyUserInfo'->>'emblemPath', ''),
  nullif(entry.value->'player'->'destinyUserInfo'->>'iconPath', ''),
  nullif(entry.value->>'emblemPath', '')
)
from pgcr_cache c,
  lateral jsonb_array_elements(c.raw_pgcr->'entries') entry
where c.instance_id = p.instance_id
  and p.emblem_path is null
  and entry.value->'player'->'destinyUserInfo'->>'membershipId' = p.membership_id;
