-- ============================================================
-- 038 - Fix trials_proven's criteria (was miscategorized as round-based)
-- ============================================================
-- "Proven" was seeded (037) with rule "round_final_blow_lead" as if it needed
-- per-round PGCR data. Verified against Bungie's actual PGCR schema that
-- "leading your team in final blows" is a whole-match comparison
-- (entries[].values.kills grouped by entries[].values.team) — no round data
-- involved, unlike Verdict/Last Rite which genuinely are round-based and
-- have no evaluator yet. Renamed to the rule that's actually implemented:
-- team_final_blow_lead (lib/badges/rerolledEvaluators.ts).

update badges
set criteria = '{"rule": "team_final_blow_lead"}'::jsonb
where slug = 'trials_proven';
