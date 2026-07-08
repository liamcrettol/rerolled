-- ============================================================
-- 045 - Full badge catalog rename pass (#311)
-- ============================================================
-- Renames name/description across the Rerolled badge set (37_rerolled_badge_seed
-- + 044's Immaculate rename) to match the new naming pass. Slugs are never
-- touched, so player_badges rows, evaluators, and any future bespoke-art
-- lookups keyed on slug are unaffected.
--
-- Two Trials badges (trials_passage, trials_passage_iii) are cut entirely
-- from the new list. Deactivated rather than deleted, so anyone who already
-- earned one keeps their history (getBadgeCatalog/RLS already filter to
-- is_active = true, so a deactivated badge simply stops appearing in the
-- catalog/Badge Case going forward).
--
-- Idempotent: plain UPDATEs by slug, safe to re-run.

-- ============ CORE ============
update badges set name = 'Drawn', description = 'Complete your first Rerolled activity.'
  where slug = 'core_drawn';
update badges set name = 'Bound', description = 'Every final blow in the match came from your rolled weapons.'
  where slug = 'core_bound';
update badges set name = 'Invariant', description = 'Complete a match without ever swapping off your Rerolled loadout.'
  where slug = 'core_no_deviation';
update badges set name = 'Threefold', description = 'Land a final blow with every weapon in your loadout in one match.'
  where slug = 'core_threefold';
update badges set name = 'Concordia', description = 'Your whole fireteam completes the activity as one.'
  where slug = 'core_full_accord';
update badges set name = 'Chain', description = 'Five Rerolled matches completed in a row.'
  where slug = 'core_chain';
update badges set name = 'Catena', description = 'Ten Rerolled matches completed in a row.'
  where slug = 'core_unbroken_chain';
update badges set name = 'Attested', description = 'Complete a scored run eligible for the leaderboard.'
  where slug = 'core_verified';
update badges set name = 'Ratified', description = 'Complete a run that counts toward the weekly challenge.'
  where slug = 'core_sanctioned';
update badges set name = 'Forfeit', description = 'This match included a final blow outside your rolled loadout.'
  where slug = 'core_forfeit';

-- ============ CRUCIBLE ============
update badges set name = 'Primus', description = 'Win a Crucible match.'
  where slug = 'crucible_writ';
update badges set name = 'Overmatch', description = '30+ defeats in a single Crucible match.'
  where slug = 'crucible_overmatch';
update badges set name = 'Vertex', description = '40+ defeats in a single Crucible match.'
  where slug = 'crucible_high_mark';
update badges set name = 'Redline', description = '50+ defeats in a single Crucible match.'
  where slug = 'crucible_redline';
update badges set name = 'Apex', description = 'Finish first on your team in score.'
  where slug = 'crucible_apex';
update badges set name = 'Redoubt', description = 'Win Control while leading your team in objective score or captures.'
  where slug = 'crucible_held_ground';
update badges set name = 'Lockout', description = 'Win Control by mercy or a large score margin.'
  where slug = 'crucible_lockout';
update badges set name = 'Solitary', description = 'Finish top three in Rumble.'
  where slug = 'crucible_solitary';
update badges set name = 'Solus', description = 'Win a Rumble match outright.'
  where slug = 'crucible_last_name';
update badges set name = 'Septimus', description = 'Earn a Seventh Column-type medal.'
  where slug = 'crucible_column_vii';
update badges set name = 'Furor', description = 'Earn a We Ran Out of Medals-type streak.'
  where slug = 'crucible_out_of_medals';
update badges set name = 'Umbra', description = 'Earn a Ghost in the Night-type medal.'
  where slug = 'crucible_ghost_signal';
update badges set name = 'Untouched', description = 'Finish a match undefeated.'
  where slug = 'crucible_untouched';

-- ============ TRIALS ============
-- trials_passage and trials_passage_iii are cut from the new list.
update badges set is_active = false
  where slug in ('trials_passage', 'trials_passage_iii');

update badges set name = 'Passage VII', description = 'Win seven Trials matches on one card.'
  where slug = 'trials_passage_vii';
update badges set name = 'Immaculate', description = 'Go without a loss on your card.'
  where slug = 'trials_lighthouse_writ';
update badges set name = 'Proven', description = 'Win a match while leading your team in final blows.'
  where slug = 'trials_proven';
update badges set name = 'Cardbound', description = 'Complete an entire Trials card.'
  where slug = 'trials_cardbound';

-- ============ IRON BANNER ============
update badges set name = 'Ironbound', description = 'Win an Iron Banner match.'
  where slug = 'iron_banner_ironbound';
update badges set name = 'Standard', description = 'Finish top two on your team in an Iron Banner match.'
  where slug = 'iron_banner_standard';
update badges set name = 'Vexillum', description = 'Complete five Iron Banner matches in one week.'
  where slug = 'iron_banner_banner_writ';
update badges set name = 'Forged', description = 'Earn a high-score Iron Banner medal.'
  where slug = 'iron_banner_forged';
update badges set name = 'Ferrum', description = 'Clear every match across a full Iron Banner week.'
  where slug = 'iron_banner_rite_of_iron';

-- ============ PVE ============
update badges set name = 'Vanguard', description = 'Complete a strike or playlist activity.'
  where slug = 'pve_vanguard_writ';
update badges set name = 'Ordeal', description = 'Complete a Nightfall.'
  where slug = 'pve_ordeal';
update badges set name = 'Apotheosis', description = 'Complete a Grandmaster Nightfall.'
  where slug = 'pve_grand_ordeal';
update badges set name = 'Consortium', description = 'Your whole fireteam completes the activity as one.'
  where slug = 'pve_fireteam_accord';
update badges set name = 'Vestibule', description = 'Complete one encounter.'
  where slug = 'pve_encounter_writ';
update badges set name = 'Abyssal', description = 'Complete a dungeon.'
  where slug = 'pve_deep_writ';
update badges set name = 'Triumphus', description = 'Complete a raid encounter or a full raid.'
  where slug = 'pve_raid_writ';
update badges set name = 'Spent', description = 'Land a final blow with every weapon in your loadout.'
  where slug = 'pve_no_reserve';

-- ============ STATUS / LEGACY ============
update badges set name = 'Founder', description = 'Played during closed beta or the early launch window.'
  where slug = 'status_founder';
update badges set name = 'Developer', description = 'Project maintainer.'
  where slug = 'status_developer';
update badges set name = 'Advisor', description = 'Helped shape rules, testing, or design.'
  where slug = 'status_advisor';
update badges set name = 'Invict', description = 'Original Invict group. Founding community badge.'
  where slug = 'status_invict';
