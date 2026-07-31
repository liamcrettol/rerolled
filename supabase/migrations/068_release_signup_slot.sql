-- 068 - Compensating release for the shared signup-cap ledger.
-- reserve_signup_slot() is called before the caller has actually persisted a
-- working account (users/bungie_accounts upsert can still fail afterward).
-- Without a rollback, a failed post-reservation step permanently burns one of
-- the fixed 150 lifetime slots. This gives both callback routes a way to
-- compensate: only removes a row this call itself just reserved (never an
-- already-registered user's slot), and never lets reserved_users go negative.

create or replace function public.release_signup_slot(
  p_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_user_id = '' then
    raise exception 'invalid signup capacity release request';
  end if;

  perform 1
  from public.signup_capacity_config
  where id = true
  for update;

  if exists (select 1 from public.signup_capacity_users where user_id = p_user_id) then
    delete from public.signup_capacity_users where user_id = p_user_id;

    update public.signup_capacity_config
    set reserved_users = greatest(reserved_users - 1, 0),
        updated_at = now()
    where id = true;
  end if;
end;
$$;

revoke all on function public.release_signup_slot(text) from public, anon, authenticated;
grant execute on function public.release_signup_slot(text) to service_role;
