-- ============================================================
-- 046 - Draft slot voting (#315)
-- ============================================================
-- Lobbies with more than one non-spectator member vote on the 3 revealed
-- candidates per slot instead of only the captain picking. One row per
-- (round, slot, voter) so re-voting before the slot locks is just an upsert.

CREATE TABLE IF NOT EXISTS lobby_draft_votes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id       uuid NOT NULL REFERENCES lobby_rounds(id) ON DELETE CASCADE,
  slot           text NOT NULL CHECK (slot IN ('kinetic', 'energy', 'power')),
  voter_user_id  text NOT NULL REFERENCES users(id),
  item_hash      bigint NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, slot, voter_user_id)
);

CREATE INDEX IF NOT EXISTS lobby_draft_votes_round_idx ON lobby_draft_votes(round_id);

ALTER TABLE lobby_draft_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read lobby_draft_votes" ON lobby_draft_votes FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE lobby_draft_votes;
