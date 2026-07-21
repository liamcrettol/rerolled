-- 067 - Add max_users to the shared signup-cap RPC response.
-- 066 is already live, so the function must be dropped before its return type
-- can change in PostgreSQL.

drop function if exists public.reserve_signup_slot(text, text);

create or replace function public.reserve_signup_slot(
  p_user_id text,
  p_site text
)
returns table (allowed boolean, already_registered boolean, user_count integer, max_users integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  config_row public.signup_capacity_config%rowtype;
begin
  if p_user_id is null or p_user_id = '' or p_site not in ('rerolled', 'rival') then
    raise exception 'invalid signup capacity request';
  end if;

  select * into config_row
  from public.signup_capacity_config
  where id = true
  for update;

  if exists (select 1 from public.signup_capacity_users where user_id = p_user_id) then
    return query select true, true, config_row.reserved_users, config_row.max_users;
    return;
  end if;

  if config_row.reserved_users >= config_row.max_users then
    return query select false, false, config_row.reserved_users, config_row.max_users;
    return;
  end if;

  insert into public.signup_capacity_users (user_id, first_site)
  values (p_user_id, p_site);

  update public.signup_capacity_config
  set reserved_users = reserved_users + 1,
      updated_at = now()
  where id = true
  returning reserved_users into config_row.reserved_users;

  return query select true, false, config_row.reserved_users, config_row.max_users;
end;
$$;

revoke all on function public.reserve_signup_slot(text, text) from public, anon, authenticated;
grant execute on function public.reserve_signup_slot(text, text) to service_role;
