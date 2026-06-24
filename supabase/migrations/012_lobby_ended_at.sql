-- Track when a lobby session actually ended so we can scope game detection
-- to only accept PGCRs that occurred while the lobby was active.
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS ended_at timestamptz;
