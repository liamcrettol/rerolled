-- 068 - Compensating release for a reserved signup slot.
-- reserve_signup_slot() runs before the users/bungie_accounts upsert in both
-- callback routes. If that upsert then fails non-transiently, the identity
-- was never actually registered but its slot stays consumed forever with no
-- way to give it back. release_signup_slot() undoes a reservation for a
-- membership_id that never became a real account, so the slot returns to the
-- pool instead of silently shrinking the 150-user cap.

create or replace function public.release_signup_slot(
  p_user_id text
)
returns table (released boolean, user_count integer, max_users integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  config_row public.signup_capacity_config%rowtype;
  deleted_count integer;
begin
  if p_user_id is null or p_user_id = '' then
    raise exception 'invalid signup capacity release request';
  end if;

  select * into config_row
  from public.signup_capacity_config
  where id = true
  for update;

  delete from public.signup_capacity_users where user_id = p_user_id;
  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    return query select false, config_row.reserved_users, config_row.max_users;
    return;
  end if;

  update public.signup_capacity_config
  set reserved_users = greatest(reserved_users - 1, 0),
      updated_at = now()
  where id = true
  returning reserved_users into config_row.reserved_users;

  return query select true, config_row.reserved_users, config_row.max_users;
end;
$$;

revoke all on function public.release_signup_slot(text) from public, anon, authenticated;
grant execute on function public.release_signup_slot(text) to service_role;
