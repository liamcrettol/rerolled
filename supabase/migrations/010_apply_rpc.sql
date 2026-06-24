-- Atomic helper: appends a player to lobby_rounds.players_applied and returns
-- true if THIS caller should execute captain rotation (first caller to complete
-- the full fireteam gets the exclusive right to rotate).
CREATE OR REPLACE FUNCTION mark_player_applied(
  p_round_id uuid,
  p_user_id text,
  p_lobby_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Members who have selected a character count as "expected" appliers
  SELECT COUNT(*) INTO v_count
  FROM lobby_members
  WHERE lobby_id = p_lobby_id AND selected_character_id IS NOT NULL;

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
