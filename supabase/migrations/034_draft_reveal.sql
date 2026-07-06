-- ============================================================
-- 034 - Rework Draft mode into a shared 1-of-3 card reveal (#266)
-- ============================================================
-- Migration 033 (#264) built the wrong mechanic: teammates picking/banning
-- weapons for each other, ending in individually-drafted loadouts. The actual
-- design is one shared fireteam loadout, same as a roulette round, just filled
-- in by captain choice (1-of-3 per slot) instead of a random roll. That reuses
-- lobby_rounds/lobby_loadout_slots directly, so the #264 tables are dead.

DROP TABLE IF EXISTS draft_picks;
DROP TABLE IF EXISTS draft_sessions;

-- The 3 candidate weapons offered for a slot in a round, persisted (rather
-- than kept client-side) so every fireteam member sees the same reveal via
-- realtime, not just the captain making the pick.
CREATE TABLE IF NOT EXISTS lobby_draft_options (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id     uuid NOT NULL REFERENCES lobby_rounds(id) ON DELETE CASCADE,
  slot         text NOT NULL CHECK (slot IN ('kinetic', 'energy', 'power')),
  position     integer NOT NULL CHECK (position IN (0, 1, 2)),
  item_hash    bigint NOT NULL,
  weapon_name  text NOT NULL,
  weapon_icon  text NOT NULL,
  weapon_type  text NOT NULL,
  damage_type  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, slot, position)
);

CREATE INDEX IF NOT EXISTS lobby_draft_options_round_idx ON lobby_draft_options(round_id);

ALTER TABLE lobby_draft_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read lobby_draft_options" ON lobby_draft_options FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE lobby_draft_options;
