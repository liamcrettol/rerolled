-- Found during the 2026-09-21 scheduled production health audit: three
-- SECURITY DEFINER RPCs predate this repo's search_path convention (see
-- 049, 051, 052, 066-068 for the pattern) and never had one pinned, unlike
-- every other SECURITY DEFINER function here.
-- 071_lock_down_unrevoked_definer_rpcs.sql already revoked EXECUTE on all
-- three from public/anon/authenticated, so this is not a live privilege-
-- escalation path today (only the already-fully-trusted service_role can
-- call them) - pinning search_path here is defense-in-depth and brings
-- them in line with the rest of the codebase's convention. CREATE OR
-- REPLACE preserves the existing grants from 071, so no revoke/grant is
-- repeated here.

CREATE OR REPLACE FUNCTION mark_player_applied(
  p_round_id uuid,
  p_user_id text,
  p_lobby_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied  text[];
  v_rotated  boolean;
  v_count    integer;
BEGIN
  -- Atomically append player (idempotent: skip if already present)
  UPDATE lobby_rounds
  SET players_applied = CASE
    WHEN p_user_id = ANY(players_applied) THEN players_applied
    ELSE array_append(players_applied, p_user_id)
  END
  WHERE id = p_round_id
  RETURNING players_applied, captain_rotated INTO v_applied, v_rotated;

  IF NOT FOUND OR v_rotated THEN RETURN false; END IF;

  -- Members who have selected a character AND are not spectating count as
  -- "expected" appliers.
  SELECT COUNT(*) INTO v_count
  FROM lobby_members
  WHERE lobby_id = p_lobby_id
    AND selected_character_id IS NOT NULL
    AND NOT is_spectator;

  IF v_count = 0 OR coalesce(array_length(v_applied, 1), 0) < v_count THEN
    RETURN false;
  END IF;

  -- All members applied: try to win the race for captain rotation
  UPDATE lobby_rounds
  SET captain_rotated = true
  WHERE id = p_round_id AND NOT captain_rotated;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION claim_detection(p_round_id uuid, p_ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE lobby_rounds
  SET detect_claimed_at = now()
  WHERE id = p_round_id
    AND (detect_claimed_at IS NULL
         OR detect_claimed_at < now() - make_interval(secs => p_ttl_seconds))
  RETURNING true INTO v_claimed;

  RETURN coalesce(v_claimed, false);
END;
$$;

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
SET search_path = public
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
