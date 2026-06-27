-- Hall of Fame aggregate RPC.
--
-- Replaces the previous JS-side aggregation which had three problems:
--   1. The static weapons-table.json (2208 entries) silently dropped any weapon
--      not in that snapshot — newer weapons just disappeared from the table.
--   2. Supabase's default PostgREST row cap (1000) meant the JS aggregation was
--      working on an incomplete dataset once weapon_round_kills grew past 1000 rows.
--   3. The kill count had no context (team aggregate with no rounds-rolled figure).
--
-- This function does the aggregation entirely in Postgres and joins weapon metadata
-- from lobby_loadout_slots, which already stores weapon_name / weapon_icon / weapon_type
-- at roll time — so it works for every weapon ever rolled, not just those in the JSON.

CREATE OR REPLACE FUNCTION get_weapon_hall_of_fame(p_limit integer DEFAULT 10)
RETURNS TABLE (
  item_hash    bigint,
  weapon_name  text,
  weapon_icon  text,
  weapon_type  text,
  total_kills  bigint,
  rounds_with_kills bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    wrk.item_hash,
    (SELECT lls.weapon_name FROM lobby_loadout_slots lls
       WHERE lls.item_hash = wrk.item_hash LIMIT 1)   AS weapon_name,
    (SELECT lls.weapon_icon FROM lobby_loadout_slots lls
       WHERE lls.item_hash = wrk.item_hash LIMIT 1)   AS weapon_icon,
    (SELECT lls.weapon_type FROM lobby_loadout_slots lls
       WHERE lls.item_hash = wrk.item_hash LIMIT 1)   AS weapon_type,
    SUM(wrk.total_kills)::bigint                       AS total_kills,
    COUNT(*)::bigint                                   AS rounds_with_kills
  FROM weapon_round_kills wrk
  GROUP BY wrk.item_hash
  HAVING SUM(wrk.total_kills) > 0
  ORDER BY total_kills DESC
  LIMIT p_limit;
$$;
