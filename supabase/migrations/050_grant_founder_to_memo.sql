-- ============================================================
-- 050 - Manual grant: Founder badge to Memo#5527
-- ============================================================
-- Grants the manually awarded Founder badge to the Bungie.net user
-- currently stored with display_name = 'Memo#5527'. Idempotent and safe to
-- re-run.

insert into player_badges (user_id, bungie_membership_id, badge_id, metadata, scope_key)
select
  u.id,
  ba.membership_id,
  b.id,
  jsonb_build_object(
    'grant', 'manual',
    'reason', 'Played during closed beta or early launch window',
    'bungie_display_name', u.display_name
  ),
  'once'
from users u
join badges b on b.slug = 'status_founder'
left join bungie_accounts ba on ba.user_id = u.id
where u.display_name = 'Memo#5527'
on conflict (user_id, badge_id, scope_key) do nothing;
