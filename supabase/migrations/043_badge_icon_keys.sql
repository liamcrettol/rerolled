-- ============================================================
-- 043 - Badge icon_key backfill (#297)
-- ============================================================
-- badges.icon_key has existed since migration 030 but was never populated —
-- every badge row has icon_key = null. This assigns each badge a shared
-- motif key by category, so the badge component system (lib/badges/assets.ts)
-- has something real to key off instead of dead metadata.
--
-- Deliberately coarse: one motif per category, not one per badge. The badge
-- system renders a single shared chip frame with the motif + tier + mode as
-- variants, not a bespoke illustration per badge (see issue #297's own
-- "efficient system" guidance) — so a handful of shared icon_key values is
-- the correct grain, not 48+ unique keys.
--
-- Idempotent: safe to re-run, and only touches rows that are still null so a
-- future manual override on a specific badge is never clobbered.

update badges set icon_key = 'laurel' where icon_key is null and category = 'completion';
update badges set icon_key = 'ring' where icon_key is null and category = 'performance';
update badges set icon_key = 'corner-cut' where icon_key is null and category = 'compliance';
update badges set icon_key = 'sigil' where icon_key is null and category = 'difficulty';
update badges set icon_key = 'rail' where icon_key is null and category = 'streak';
update badges set icon_key = 'status' where icon_key is null and category = 'founder';
