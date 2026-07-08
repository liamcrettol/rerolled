-- ============================================================
-- 045 - Tag lobbies with their mode (#280)
-- ============================================================
-- roulette/draft/endgame lobbies all share the lobbies table with nothing
-- distinguishing them, so mode-aware UI (rejoin routing, active-session
-- banners) has to guess from whichever route rendered it. Tag the row
-- explicitly at creation instead.

ALTER TABLE lobbies
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'roulette'
    CHECK (mode IN ('roulette', 'draft', 'endgame'));
