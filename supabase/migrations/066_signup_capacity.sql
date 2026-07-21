-- 066 - Shared lifetime sign-up cap for Rerolled and Rival.
-- Rerolled owns this ledger; Rival reserves through the internal API.

create table if not exists public.signup_capacity_users (
  user_id text primary key,
  first_site text not null check (first_site in ('rerolled', 'rival')),
  created_at timestamptz not null default now()
);

create table if not exists public.signup_capacity_config (
  id boolean primary key default true check (id),
  max_users integer not null default 150 check (max_users > 0),
  reserved_users integer not null default 0 check (reserved_users >= 0),
  updated_at timestamptz not null default now()
);

insert into public.signup_capacity_config (id, max_users, reserved_users)
values (true, 150, 0)
on conflict (id) do nothing;

-- Existing Rerolled users already count toward the lifetime cap. Rival's
-- current roster is mirrored from this same set of Bungie identities.
insert into public.signup_capacity_users (user_id, first_site)
select id, 'rerolled'
from public.users
on conflict (user_id) do nothing;

update public.signup_capacity_config
set reserved_users = (select count(*)::integer from public.signup_capacity_users),
    updated_at = now()
where id = true;

alter table public.signup_capacity_users enable row level security;
alter table public.signup_capacity_config enable row level security;
revoke all on public.signup_capacity_users from anon, authenticated;
revoke all on public.signup_capacity_config from anon, authenticated;

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

  if exists (
    select 1 from public.signup_capacity_users where user_id = p_user_id
  ) then
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
