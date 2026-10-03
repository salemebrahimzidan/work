-- Tenant foundation only.
-- Creates the first company, memberships, and active-company helpers.
-- Does not change customers, transactions, services, business RLS, or existing rows.
-- Run this file as one script so the whole change commits or rolls back together.

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

comment on table public.companies is
  'One tenant. Business rows are attached to a company in a later migration.';

-- ----------------------------------------------------------------------------
-- company_members
-- ----------------------------------------------------------------------------
create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'user')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  constraint company_members_company_user_key unique (company_id, user_id)
);

create index if not exists company_members_user_status_idx
  on public.company_members (user_id, status);

comment on table public.company_members is
  'Company role for a login. Pending profiles have no row.';

-- ----------------------------------------------------------------------------
-- user_active_company
-- ----------------------------------------------------------------------------
create table if not exists public.user_active_company (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete restrict,
  updated_at timestamptz not null default now()
);

comment on table public.user_active_company is
  'The company a user is working in. Written by set_active_company after a membership check.';

-- ----------------------------------------------------------------------------
-- Helpers. search_path is pinned. PUBLIC and anon cannot execute them.
-- ----------------------------------------------------------------------------
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and c.status = 'active'
  );
$$;

create or replace function public.has_company_role(p_company_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and c.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function public.current_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  active_id uuid;
  only_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select c.company_id
    into active_id
  from public.user_active_company c
  where c.user_id = auth.uid()
    and public.is_company_member(c.company_id);

  if active_id is not null then
    return active_id;
  end if;

  select case when count(*) = 1 then min(m.company_id) else null end
    into only_id
  from public.company_members m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and c.status = 'active';

  return only_id;
end;
$$;

create or replace function public.set_active_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_company_member(p_company_id) then
    raise exception 'لا تملك صلاحية هذه الشركة';
  end if;

  insert into public.user_active_company (user_id, company_id)
  values (auth.uid(), p_company_id)
  on conflict (user_id) do update
    set company_id = excluded.company_id,
        updated_at = now();
end;
$$;

-- Direct SQL Editor / migration session: no JWT user, and the login role is
-- the database owner. API calls keep session_user = authenticator, including
-- service_role, so they do not qualify.
create or replace function public.is_database_migration()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
     and session_user in ('postgres', 'supabase_admin');
$$;

-- Membership changes from a signed-in session cannot retarget the row or
-- remove the only owner. The initial backfill is a database migration session.
create or replace function public.guard_company_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is null and not public.is_database_migration() then
      raise exception 'غير مصرح بتعديل عضوية الشركة';
    end if;
    if old.role = 'owner' and not exists (
      select 1
      from public.company_members m
      where m.company_id = old.company_id
        and m.role = 'owner'
        and m.user_id <> old.user_id
    ) then
      raise exception 'لا يمكن إزالة مالك الشركة الوحيد';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_database_migration() then
      raise exception 'غير مصرح بإضافة عضوية';
    end if;
    return new;
  end if;

  new.company_id := old.company_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;

  if old.role = 'owner'
     and new.role is distinct from 'owner'
     and not exists (
       select 1
       from public.company_members m
       where m.company_id = old.company_id
         and m.role = 'owner'
         and m.user_id <> old.user_id
     ) then
    raise exception 'لا يمكن إزالة مالك الشركة الوحيد';
  end if;

  if public.is_database_migration() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'غير مصرح بتعديل عضوية الشركة';
  end if;

  if new.role is distinct from old.role or new.status is distinct from old.status then
    if not public.has_company_role(old.company_id, array['owner', 'admin']) then
      raise exception 'غير مصرح بتعديل عضوية الشركة';
    end if;
    if new.role = 'owner' and not public.has_company_role(old.company_id, array['owner']) then
      raise exception 'غير مصرح بتعديل ملكية الشركة';
    end if;
    if old.role = 'owner' and not public.has_company_role(old.company_id, array['owner']) then
      raise exception 'غير مصرح بتعديل ملكية الشركة';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_user_active_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  elsif not public.is_database_migration() then
    raise exception 'لا تملك صلاحية هذه الشركة';
  end if;

  if not exists (
    select 1
    from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.company_id = new.company_id
      and m.user_id = new.user_id
      and m.status = 'active'
      and c.status = 'active'
  ) then
    raise exception 'لا تملك صلاحية هذه الشركة';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_members_guard on public.company_members;
create trigger company_members_guard
  before insert or update or delete on public.company_members
  for each row execute function public.guard_company_member();

drop trigger if exists user_active_company_guard on public.user_active_company;
create trigger user_active_company_guard
  before insert or update on public.user_active_company
  for each row execute function public.guard_user_active_company();

-- ----------------------------------------------------------------------------
-- RLS. Signed-in users may read their own membership. Writes go through
-- set_active_company, which checks an active membership first.
-- ----------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.user_active_company enable row level security;

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member on public.companies
  for select to authenticated
  using (public.is_company_member(id));

drop policy if exists company_members_select_own on public.company_members;
create policy company_members_select_own on public.company_members
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_active_company_select_own on public.user_active_company;
create policy user_active_company_select_own on public.user_active_company
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.companies from anon, authenticated, service_role;
revoke all on public.company_members from anon, authenticated, service_role;
revoke all on public.user_active_company from anon, authenticated, service_role;
grant select on public.companies to authenticated;
grant select on public.company_members to authenticated;
grant select on public.user_active_company to authenticated;

revoke all on function public.is_company_member(uuid) from public, anon, service_role;
revoke all on function public.has_company_role(uuid, text[]) from public, anon, service_role;
revoke all on function public.current_company_id() from public, anon, service_role;
revoke all on function public.set_active_company(uuid) from public, anon, service_role;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.set_active_company(uuid) to authenticated;

revoke all on function public.is_database_migration() from public, anon, authenticated, service_role;
revoke all on function public.guard_company_member() from public, anon, authenticated, service_role;
revoke all on function public.guard_user_active_company() from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- First company and existing approved accounts.
-- profiles.role is not changed. Pending accounts get no membership.
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id uuid;
  v_owner_id uuid;
begin
  select c.id
    into v_company_id
  from public.companies c
  where c.name = 'الإيمان روح الذهبية'
  order by c.created_at, c.id
  limit 1;

  if v_company_id is null then
    insert into public.companies (name, status)
    values ('الإيمان روح الذهبية', 'active')
    returning id into v_company_id;
  end if;

  select p.id
    into v_owner_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'admin'
  order by u.created_at, p.created_at, p.id
  limit 1;

  insert into public.company_members (company_id, user_id, role, status)
  select
    v_company_id,
    p.id,
    case
      when p.id = v_owner_id then 'owner'
      when p.role = 'admin' then 'admin'
      else 'user'
    end,
    'active'
  from public.profiles p
  where p.role in ('admin', 'user')
  on conflict (company_id, user_id) do nothing;

  insert into public.user_active_company (user_id, company_id)
  select m.user_id, m.company_id
  from public.company_members m
  where m.company_id = v_company_id
    and m.status = 'active'
  on conflict (user_id) do nothing;
end $$;
