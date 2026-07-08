-- ============================================================
-- 044 - Rename Lighthouse Writ to Immaculate (#309)
-- ============================================================
-- Display-name-only rename. slug stays trials_lighthouse_writ so any
-- existing player_badges rows and code referencing the slug (badge asset
-- registry, bespoke override) keep working unchanged.

update badges set name = 'Immaculate' where slug = 'trials_lighthouse_writ';
