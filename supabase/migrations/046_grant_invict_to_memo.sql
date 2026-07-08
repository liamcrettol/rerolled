-- ============================================================
-- 046 - Manual grant: Invict badge to Memo#5527
-- ============================================================
-- Grants the manually awarded founding community badge to the Bungie.net user
-- currently stored with display_name = 'Memo#5527'. Idempotent and safe to
-- re-run.

insert into player_badges (user_id, bungie_membership_id, badge_id, metadata, scope_key)
select
  u.id,
  ba.membership_id,
  b.id,
  jsonb_build_object(
    'grant', 'manual',
    'reason', 'Original Invict group / founding community badge',
    'bungie_display_name', u.display_name
  ),
  'once'
from users u
join badges b on b.slug = 'status_invict'
left join bungie_accounts ba on ba.user_id = u.id
where u.display_name = 'Memo#5527'
on conflict (user_id, badge_id, scope_key) do nothing;
