-- Captain swap timing + round history improvements

-- Link game sessions directly to the round they belong to
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES lobby_rounds(id);
-- Activity/map info for round history display
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS map_name text;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS activity_hash bigint;

-- Track which players have applied their loadout this round
-- Used to trigger captain rotation when everyone has applied
ALTER TABLE lobby_rounds ADD COLUMN IF NOT EXISTS players_applied text[] NOT NULL DEFAULT '{}';
-- Race guard: ensures captain rotates exactly once per round
ALTER TABLE lobby_rounds ADD COLUMN IF NOT EXISTS captain_rotated boolean NOT NULL DEFAULT false;

-- Captain preference: stay captain after the match instead of rotating
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS captain_locked boolean NOT NULL DEFAULT false;
