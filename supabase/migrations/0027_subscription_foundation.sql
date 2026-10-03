-- Subscription catalog and one current subscription per company.
-- Does not enforce limits and does not add a payment provider.
-- Does not change company status, memberships, profiles.role, or tenant RLS.
-- Company roles and profiles.role do not grant platform-admin authority.
-- Run this file as one script so the whole change commits or rolls back together.

-- ----------------------------------------------------------------------------
-- plans — platform catalog, not owned by a company
-- ----------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  billing_interval text not null,
  trial_days integer,
  employee_limit integer,
  member_limit integer,
  branch_limit integer,
  is_public boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_key unique (code),
  constraint plans_code_not_blank check (length(btrim(code)) > 0),
  constraint plans_name_not_blank check (length(btrim(name)) > 0),
  constraint plans_billing_interval_check check (
    billing_interval in ('none', 'month', 'year')
  ),
  constraint plans_trial_days_check check (trial_days is null or trial_days >= 0),
  constraint plans_employee_limit_check check (
    employee_limit is null or employee_limit >= 0
  ),
  constraint plans_member_limit_check check (
    member_limit is null or member_limit >= 0
  ),
  constraint plans_branch_limit_check check (
    branch_limit is null or branch_limit >= 0
  )
);

comment on table public.plans is
  'Platform plan catalog. Null limits mean unlimited. Prices are not stored here.';
comment on column public.plans.member_limit is
  'Limit for active company_members rows, not employees.';

-- ----------------------------------------------------------------------------
-- company_subscriptions — one current row per company
-- ----------------------------------------------------------------------------
create table public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null,
  billing_interval text not null,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  employee_limit integer,
  member_limit integer,
  branch_limit integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_subscriptions_company_key unique (company_id),
  constraint company_subscriptions_status_check check (
    status in ('trialing', 'active', 'cancelled', 'expired')
  ),
  constraint company_subscriptions_billing_interval_check check (
    billing_interval in ('none', 'month', 'year')
  ),
  constraint company_subscriptions_trial_status_check check (
    (status = 'trialing' and trial_ends_at is not null)
    or status <> 'trialing'
  ),
  constraint company_subscriptions_cancelled_status_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or status <> 'cancelled'
  ),
  constraint company_subscriptions_trial_order_check check (
    trial_starts_at is null
    or trial_ends_at is null
    or trial_ends_at >= trial_starts_at
  ),
  constraint company_subscriptions_period_order_check check (
    current_period_start is null
    or current_period_end is null
    or current_period_end >= current_period_start
  ),
  constraint company_subscriptions_employee_limit_check check (
    employee_limit is null or employee_limit >= 0
  ),
  constraint company_subscriptions_member_limit_check check (
    member_limit is null or member_limit >= 0
  ),
  constraint company_subscriptions_branch_limit_check check (
    branch_limit is null or branch_limit >= 0
  )
);

comment on table public.company_subscriptions is
  'Current subscription for one company. Null limit overrides mean use the plan.';
comment on column public.company_subscriptions.employee_limit is
  'Company override. Null uses plans.employee_limit. Not enforced in this migration.';

create index company_subscriptions_plan_idx
  on public.company_subscriptions (plan_id);

-- ----------------------------------------------------------------------------
-- platform_admins — not a tenant table and not seeded
-- ----------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint platform_admins_status_check check (status in ('active', 'suspended'))
);

comment on table public.platform_admins is
  'Platform operator. profiles.role and company_members.role do not qualify.';

-- ----------------------------------------------------------------------------
-- True only for an active row in platform_admins. Security definer so the
-- read policy can call it without recursing through that table's RLS.
-- ----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.user_id = auth.uid()
      and a.status = 'active'
  );
$$;

comment on function public.is_platform_admin() is
  'Platform authority for billing tables only. Does not read tenant business tables.';

-- ----------------------------------------------------------------------------
-- Writes require the SQL Editor migration session or an active platform admin.
-- is_database_migration() is true only when auth.uid() is null and
-- session_user is postgres or supabase_admin. API roles do not qualify.
-- ----------------------------------------------------------------------------
create or replace function public.guard_billing_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_database_migration() and not public.is_platform_admin() then
    raise exception 'غير مصرح بتعديل بيانات الاشتراك';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and tg_table_name = 'plans' then
    new.id := old.id;
    new.code := old.code;
    new.created_at := old.created_at;
    new.updated_at := now();
  elsif tg_op = 'UPDATE' and tg_table_name = 'company_subscriptions' then
    new.id := old.id;
    new.company_id := old.company_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  elsif tg_op = 'UPDATE' and tg_table_name = 'platform_admins' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists plans_guard_write on public.plans;
create trigger plans_guard_write
  before insert or update or delete on public.plans
  for each row execute function public.guard_billing_write();

drop trigger if exists company_subscriptions_guard_write on public.company_subscriptions;
create trigger company_subscriptions_guard_write
  before insert or update or delete on public.company_subscriptions
  for each row execute function public.guard_billing_write();

drop trigger if exists platform_admins_guard_write on public.platform_admins;
create trigger platform_admins_guard_write
  before insert or update or delete on public.platform_admins
  for each row execute function public.guard_billing_write();

-- ----------------------------------------------------------------------------
-- RLS. Members can read the public catalog and their own subscription.
-- No write policy exists for any company role.
-- ----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.platform_admins enable row level security;

drop policy if exists plans_select_member on public.plans;
create policy plans_select_member on public.plans
  for select to authenticated
  using (
    is_active
    and is_public
    and public.current_company_id() is not null
    and public.is_company_member(public.current_company_id())
  );

drop policy if exists plans_select_platform on public.plans;
create policy plans_select_platform on public.plans
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists company_subscriptions_select on public.company_subscriptions;
create policy company_subscriptions_select on public.company_subscriptions
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self on public.platform_admins
  for select to authenticated
  using (
    user_id = auth.uid()
    and status = 'active'
    and public.is_platform_admin()
  );

revoke all on public.plans from public, anon, authenticated, service_role;
revoke all on public.company_subscriptions from public, anon, authenticated, service_role;
revoke all on public.platform_admins from public, anon, authenticated, service_role;

grant select on public.plans to authenticated;
grant select on public.company_subscriptions to authenticated;
grant select on public.platform_admins to authenticated;

revoke all on function public.is_platform_admin() from public, anon, service_role;
revoke all on function public.guard_billing_write() from public, anon, service_role;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.guard_billing_write() to authenticated;

-- ----------------------------------------------------------------------------
-- Seed the current office only. Abort when the company name is missing
-- or duplicated. Do not update the company or any business rows.
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_count integer;
  v_company_id uuid;
  v_plan_id uuid;
begin
  select count(*)
    into v_company_count
  from public.companies
  where name = 'الإيمان روح الذهبية';

  if v_company_count <> 1 then
    raise exception
      'يجب أن توجد شركة واحدة فقط باسم الإيمان روح الذهبية (العدد %)',
      v_company_count;
  end if;

  select c.id
    into v_company_id
  from public.companies c
  where c.name = 'الإيمان روح الذهبية';

  insert into public.plans (
    code,
    name,
    description,
    billing_interval,
    trial_days,
    employee_limit,
    member_limit,
    branch_limit,
    is_public,
    is_active,
    sort_order
  ) values (
    'legacy',
    'الباقة الحالية',
    null,
    'none',
    null,
    null,
    null,
    null,
    true,
    true,
    0
  )
  on conflict (code) do nothing;

  select p.id
    into v_plan_id
  from public.plans p
  where p.code = 'legacy';

  if v_plan_id is null then
    raise exception 'تعذر إنشاء الباقة الحالية';
  end if;

  insert into public.company_subscriptions (
    company_id,
    plan_id,
    status,
    billing_interval,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    cancelled_at,
    employee_limit,
    member_limit,
    branch_limit
  )
  select
    v_company_id,
    v_plan_id,
    'active',
    'none',
    null,
    null,
    now(),
    null,
    null,
    null,
    null,
    null
  where not exists (
    select 1
    from public.company_subscriptions s
    where s.company_id = v_company_id
  );
end $$;
