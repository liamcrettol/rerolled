-- ============================================================
-- 051 - Automatically grant Founder to authenticated users
-- ============================================================
-- The Bungie callback upserts `users` on every successful authentication.
-- This trigger turns that durable auth write into an idempotent Founder grant.
-- It also backfills every existing user so nobody must re-authenticate just to
-- receive the badge.

update badges
set description = 'Joined Rerolled and authenticated a Bungie account.'
where slug = 'status_founder';

create or replace function grant_founder_badge_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge_id uuid;
  v_membership_id text;
begin
  select id
  into v_badge_id
  from badges
  where slug = 'status_founder'
    and is_active = true
  limit 1;

  if v_badge_id is null then
    return new;
  end if;

  select membership_id
  into v_membership_id
  from bungie_accounts
  where user_id = new.id
  limit 1;

  insert into player_badges (
    user_id,
    bungie_membership_id,
    badge_id,
    metadata,
    scope_key
  )
  values (
    new.id,
    v_membership_id,
    v_badge_id,
    jsonb_build_object(
      'grant', 'automatic_auth',
      'reason', 'Authenticated with Rerolled',
      'bungie_display_name', new.display_name
    ),
    'once'
  )
  on conflict (user_id, badge_id, scope_key)
  do update set
    bungie_membership_id = coalesce(excluded.bungie_membership_id, player_badges.bungie_membership_id),
    metadata = player_badges.metadata || excluded.metadata;

  return new;
end;
$$;

drop trigger if exists users_auto_grant_founder on users;
create trigger users_auto_grant_founder
after insert or update of updated_at on users
for each row execute function grant_founder_badge_to_user();

-- Existing users receive the same idempotent grant immediately.
insert into player_badges (
  user_id,
  bungie_membership_id,
  badge_id,
  metadata,
  scope_key
)
select
  u.id,
  ba.membership_id,
  b.id,
  jsonb_build_object(
    'grant', 'automatic_auth_backfill',
    'reason', 'Authenticated with Rerolled',
    'bungie_display_name', u.display_name
  ),
  'once'
from users u
join badges b
  on b.slug = 'status_founder'
 and b.is_active = true
left join bungie_accounts ba
  on ba.user_id = u.id
on conflict (user_id, badge_id, scope_key)
do update set
  bungie_membership_id = coalesce(excluded.bungie_membership_id, player_badges.bungie_membership_id),
  metadata = player_badges.metadata || excluded.metadata;
