-- ============================================================
-- 032 - Server-owned roll pool cache (#238)
-- ============================================================
-- The roll pool (owned-weapon intersection) and its display metadata were
-- computed by /api/roulette/intersection and then handed back to the client,
-- which passed them into /api/roulette/roll. That made the pool client-owned:
-- a tampered request could roll a weapon nobody in the fireteam owns.
--
-- This table lets the server cache the computed pool per lobby so /roll can
-- validate submitted hashes against a server-owned source of truth instead of
-- trusting the request body. One row per lobby, upserted each time the
-- intersection is (re)computed.

CREATE TABLE IF NOT EXISTS lobby_pools (
  lobby_id       uuid PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  -- { "kinetic": number[], "energy": number[], "power": number[] } — the valid
  -- roll pool the server computed.
  pool           jsonb NOT NULL,
  -- { "<itemHash>": { name, icon, weaponType, damageType, ... } } — server-owned
  -- display metadata used when writing loadout slots.
  weapon_details jsonb NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lobby_pools ENABLE ROW LEVEL SECURITY;
-- Read-only to anon (same posture as other lobby tables); writes go through the
-- service-role client in the intersection route.
CREATE POLICY "anon read lobby_pools" ON lobby_pools FOR SELECT USING (true);
