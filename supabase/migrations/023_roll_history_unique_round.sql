-- ============================================================
-- 023 - roll_history: unique constraint on round_id
-- ============================================================
-- /api/apply used select-then-insert/update against roll_history because no
-- unique constraint existed on round_id. Every fireteam member calls /apply
-- individually each round, so two members applying within the same race
-- window both saw no existing row and both inserted, producing duplicate
-- roll_history rows per round. Adding the constraint lets the app use a real
-- upsert instead.
ALTER TABLE roll_history ADD CONSTRAINT roll_history_round_id_key UNIQUE (round_id);
