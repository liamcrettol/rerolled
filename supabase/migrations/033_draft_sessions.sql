-- ============================================================
-- 033 - Draft mode sessions and picks (#264, part of #237 Phase 3)
-- ============================================================
-- Draft mode: the fireteam picks/bans your guns. Turn order determines whose
-- slot is being filled ("the subject"); the pure state machine in
-- lib/draft/session.ts enforces that the subject can't pick their own
-- weapon. One draft session per lobby at a time.

CREATE TABLE IF NOT EXISTS draft_sessions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id      uuid NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'picking'
                  CHECK (status IN ('picking', 'completed', 'abandoned')),
  -- Stable turn order of the players being drafted for (subjects), decided at
  -- creation time from lobby_members. Do not mutate after picks exist — see
  -- buildTurnSequence in lib/draft/session.ts.
  player_order      jsonb NOT NULL,
  skipped_user_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

-- Only one active ("picking") draft per lobby at a time. Completed/abandoned
-- sessions stay around as history, so this is a partial index rather than a
-- plain UNIQUE(lobby_id, status).
CREATE UNIQUE INDEX IF NOT EXISTS draft_sessions_one_active_per_lobby
  ON draft_sessions(lobby_id)
  WHERE status = 'picking';

CREATE TABLE IF NOT EXISTS draft_picks (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id        uuid NOT NULL REFERENCES draft_sessions(id) ON DELETE CASCADE,
  for_user_id       text NOT NULL REFERENCES users(id),
  picked_by_user_id text NOT NULL REFERENCES users(id),
  slot              text NOT NULL CHECK (slot IN ('kinetic', 'energy', 'power')),
  item_hash         bigint NOT NULL,
  pick_number       integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, for_user_id, slot)
);

CREATE INDEX IF NOT EXISTS draft_picks_session_idx ON draft_picks(session_id);

ALTER TABLE draft_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read draft_sessions" ON draft_sessions FOR SELECT USING (true);
CREATE POLICY "anon read draft_picks" ON draft_picks FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE draft_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE draft_picks;
