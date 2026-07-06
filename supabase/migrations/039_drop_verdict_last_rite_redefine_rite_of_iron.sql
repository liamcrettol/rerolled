-- ============================================================
-- 039 - Drop trials_verdict/trials_last_rite; redefine iron_banner_rite_of_iron
-- ============================================================
-- Decisions from #278: Verdict and Last Rite are cut from v1 entirely —
-- Bungie's PGCR has no round-by-round data, so "no round with an illegal
-- final blow" and "the final round's winning blow" cannot be verified from
-- the API at all. Confirmed no player_badges rows reference either badge
-- before deleting (nothing evaluates badges yet — see #277's worker-wiring
-- follow-up), so this is a safe hard delete, not a soft-disable.
--
-- Rite of Iron's "session" is redefined to the whole active Iron Banner week
-- (same scope as Banner Writ) rather than an undefined play-sitting concept.

delete from badges where slug in ('trials_verdict', 'trials_last_rite');

update badges
set criteria = '{"rule": "weekly_all_valid", "activity_family": "iron_banner"}'::jsonb
where slug = 'iron_banner_rite_of_iron';
