-- ============================================================
-- 050 - Crucible match map image
-- ============================================================
-- Stores the activity's pgcrImage (map banner) alongside the name so the
-- match report can show the map. Nullable: existing rows backfill as they are
-- re-synced, and the match-history read tolerates the column being absent.

alter table crucible_matches add column if not exists activity_image text;
