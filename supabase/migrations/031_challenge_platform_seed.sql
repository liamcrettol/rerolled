-- ============================================================
-- 031 - Seed data: one season, one draft weekly challenge, v1 badges
-- ============================================================
-- Idempotent (ON CONFLICT DO NOTHING) so re-running this migration is safe.

insert into seasons (season_key, display_name, starts_at, ends_at, status, description)
values (
  'season-0',
  'Season 0',
  now(),
  now() + interval '90 days',
  'draft',
  'Placeholder season for challenge-platform bring-up. Replace dates/key once the real Destiny season is known.'
)
on conflict (season_key) do nothing;

insert into weekly_challenges (
  season_id, week_number, title, slug, description,
  activity_family, starts_at, ends_at, status, global_seed, rules
)
select
  s.id,
  1,
  'Week 1 (draft)',
  'week-1-draft',
  'Placeholder draft challenge, not published. Generate a real draft with `npm run weekly:generate -- --week 1`.',
  'other',
  now(),
  now() + interval '7 days',
  'draft',
  'season-0-week-1',
  '[]'::jsonb
from seasons s
where s.season_key = 'season-0'
on conflict (slug) do nothing;

insert into badges (slug, name, description, category, tier, is_repeatable, sort_order, criteria)
values
  (
    'weekly_clear',
    'Weekly Clear',
    'Completed at least one weekly challenge.',
    'completion',
    'bronze',
    false,
    10,
    '{}'::jsonb
  ),
  (
    'pure_roll',
    'Pure Roll',
    '100% equipment snapshot compliance for a run.',
    'compliance',
    'gold',
    true,
    20,
    '{"minimum_compliance_pct": 100}'::jsonb
  ),
  (
    'no_rerolls',
    'No Rerolls',
    'Completed a weekly challenge with zero rerolls used.',
    'difficulty',
    'silver',
    true,
    30,
    '{"max_reroll_count": 0}'::jsonb
  ),
  (
    'top_10_percent_weekly',
    'Top 10%',
    'Finished in the top 10% of a weekly challenge leaderboard.',
    'performance',
    'gold',
    true,
    40,
    '{"max_percentile": 10}'::jsonb
  ),
  (
    'three_week_streak',
    'Three-Week Streak',
    'Cleared three weekly challenges in a row.',
    'streak',
    'silver',
    false,
    50,
    '{"min_streak_weeks": 3}'::jsonb
  )
on conflict (slug) do nothing;
