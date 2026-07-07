-- ============================================================
-- 042 - Fireteam Endgame Roulette
-- ============================================================
-- Adds a fireteam/lobby version of Endgame Roulette (raid/dungeon/GM
-- randomizer) alongside the existing solo-only flow. Follows the same
-- pattern Draft mode used (034): reuse lobbies/lobby_members/lobby_rounds/
-- lobby_loadout_slots unchanged, add new mode-specific tables keyed off
-- lobby_rounds.id.
--
-- lobby_endgame_rounds: one row per round, the shared roll result (activity +
-- which armor slot everyone rolls for this round).
--
-- lobby_endgame_exotic_picks: one row per (round, member) - each player's own
-- resolved exotic for that round's slot, since exotic armor is class-locked
-- and can't be shared as a single literal item across a mixed-class
-- fireteam. `status` distinguishes "nothing owned in this slot" from "we
-- couldn't reach your Bungie profile" from "your Bungie connection needs
-- reconnecting" - different situations, different UI messages.

CREATE TABLE IF NOT EXISTS lobby_endgame_rounds (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id            uuid NOT NULL REFERENCES lobby_rounds(id) ON DELETE CASCADE,
  activity_hash       bigint NOT NULL,
  activity_name       text NOT NULL,
  activity_kind       text NOT NULL CHECK (activity_kind IN ('raid', 'dungeon', 'grandmaster')),
  exotic_bucket_hash  bigint NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id)
);

CREATE TABLE IF NOT EXISTS lobby_endgame_exotic_picks (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id            uuid NOT NULL REFERENCES lobby_rounds(id) ON DELETE CASCADE,
  user_id             text NOT NULL REFERENCES users(id),
  status              text NOT NULL CHECK (status IN ('resolved', 'none_owned', 'fetch_failed', 'missing_character', 'missing_token')),
  item_hash           bigint,
  item_instance_id    text,
  name                text,
  icon                text,
  class_type          integer,
  slot_label          text,
  location            text CHECK (location IN ('character', 'vault')),
  character_id        text,
  is_equipped         boolean,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id),
  CHECK (
    status != 'resolved'
    OR (item_hash IS NOT NULL AND name IS NOT NULL AND slot_label IS NOT NULL AND class_type IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS lobby_endgame_rounds_round_idx ON lobby_endgame_rounds(round_id);
CREATE INDEX IF NOT EXISTS lobby_endgame_exotic_picks_user_round_idx ON lobby_endgame_exotic_picks(user_id, round_id);

ALTER TABLE lobby_endgame_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_endgame_exotic_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read lobby_endgame_rounds" ON lobby_endgame_rounds FOR SELECT USING (true);
CREATE POLICY "anon read lobby_endgame_exotic_picks" ON lobby_endgame_exotic_picks FOR SELECT USING (true);

-- Direct table subscription (same pattern as lobby_draft_options in 034) so
-- EndgameLobbyBoard can refetch on any change, rather than the lobby_rounds/
-- current_round indirection lobby_rounds itself was deliberately dropped from
-- (041) - rolling endgame doesn't advance current_round, so that signal
-- wouldn't fire here anyway.
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_endgame_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_endgame_exotic_picks;
