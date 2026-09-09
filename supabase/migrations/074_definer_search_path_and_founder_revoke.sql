-- Found during the 2026-09-09 scheduled production health audit: two
-- SECURITY DEFINER gaps left over from before this repo's "every definer
-- function pairs with SET search_path and a REVOKE" pattern existed.
--
-- 1. mark_player_applied, claim_detection, and get_weapon_hall_of_fame had
--    EXECUTE revoked from public/anon/authenticated in migration 071, but
--    their own function bodies (010/022, 014, 016) never set search_path.
--    Every SECURITY DEFINER function added since (049 onward) sets it to
--    close the classic search-path-injection footgun (a caller-controlled
--    search_path making the function resolve an attacker's shadow object
--    instead of the intended one). EXECUTE is already service_role-only
--    after 071, so this is defense-in-depth, not a live bypass.
-- 2. grant_founder_badge_to_user() (051) is SECURITY DEFINER with
--    search_path already locked down, but unlike every other definer
--    function in this repo, it never had EXECUTE revoked from
--    public/anon/authenticated. It's RETURNS trigger, so Postgres already
--    refuses a direct `select grant_founder_badge_to_user()` call outside
--    trigger context regardless of grants - trigger firing itself does not
--    require EXECUTE privilege - but revoking keeps this repo's "every
--    definer function gets a revoke" invariant consistent for anyone
--    auditing grants later.

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
STABLE
SET search_path = public
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

-- Re-apply the same grants 071 gave these three functions: CREATE OR REPLACE
-- above does not change existing grants, but stating them again keeps this
-- migration self-contained and safe to read on its own.
revoke all on function mark_player_applied(uuid, text, uuid) from public, anon, authenticated;
grant execute on function mark_player_applied(uuid, text, uuid) to service_role;

revoke all on function claim_detection(uuid, integer) from public, anon, authenticated;
grant execute on function claim_detection(uuid, integer) to service_role;

revoke all on function get_weapon_hall_of_fame(integer) from public, anon, authenticated;
grant execute on function get_weapon_hall_of_fame(integer) to service_role;

revoke all on function grant_founder_badge_to_user() from public, anon, authenticated;
