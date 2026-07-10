-- ============================================================
-- 049 - Manual grant: Developer badge to project maintainers
-- ============================================================
-- Grants the manually awarded Developer badge to the Bungie.net users
-- currently stored with these display names:
--   - Memo#5527
--   - Kaiuzo#8294
--   - Vakudo#6535
-- Idempotent and safe to re-run.

insert into player_badges (user_id, bungie_membership_id, badge_id, metadata, scope_key)
select
  u.id,
  ba.membership_id,
  b.id,
  jsonb_build_object(
    'grant', 'manual',
    'reason', 'Project maintainer',
    'bungie_display_name', u.display_name
  ),
  'once'
from users u
join badges b on b.slug = 'status_developer'
left join bungie_accounts ba on ba.user_id = u.id
where u.display_name in ('Memo#5527', 'Kaiuzo#8294', 'Vakudo#6535')
on conflict (user_id, badge_id, scope_key) do nothing;
