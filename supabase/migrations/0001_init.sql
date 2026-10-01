-- ============================================================================
-- نظام إدارة العملاء — المخطط الأساسي
-- Private customer management system: schema, RLS, immutable profits.
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

create extension if not exists "pgcrypto";

-- Timezone used for "today" / "this month" calculations.
create or replace function public.app_timezone()
returns text language sql immutable as $$ select 'Asia/Riyadh'::text $$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  -- pending = مسجَّل ولكن لا يملك أي صلاحية وصول حتى يعتمده المشرف
  role text not null default 'pending' check (role in ('pending', 'user', 'admin')),
  created_at timestamptz not null default now()
);

-- Reads the caller's role without triggering RLS recursion on profiles.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- An approved member. Accounts stay 'pending' (zero access) until promoted.
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('user', 'admin')
  );
$$;

-- Every auth user gets a profile. The very first user becomes the admin,
-- anyone who signs up afterwards is 'pending' and sees no data at all.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this migration.
insert into public.profiles (id, full_name, role)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
       case when row_number() over (order by u.created_at) = 1 then 'admin' else 'user' end
from auth.users u
on conflict (id) do nothing;

-- Only admins may change roles.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'غير مصرح بتغيير الصلاحيات';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  mobile text not null check (length(btrim(mobile)) > 0),
  national_id text,
  nationality text not null check (length(btrim(nationality)) > 0),
  city text not null check (length(btrim(city)) > 0),
  district text,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists customers_full_name_idx on public.customers (full_name);
create index if not exists customers_mobile_idx on public.customers (mobile);
create index if not exists customers_nationality_idx on public.customers (nationality);
create index if not exists customers_city_idx on public.customers (city);
create index if not exists customers_created_at_idx on public.customers (created_at desc);

-- Editing customer data is allowed, but ownership/creation metadata is not.
create or replace function public.guard_customer_metadata()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists customers_guard_metadata on public.customers;
create trigger customers_guard_metadata
  before update on public.customers
  for each row execute function public.guard_customer_metadata();

-- ----------------------------------------------------------------------------
-- transactions — append only, profit is never mutated
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_name text not null check (length(btrim(service_name)) > 0),
  profit numeric(14, 2) not null check (profit >= 0),
  note text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists transactions_customer_id_idx on public.transactions (customer_id);
create index if not exists transactions_created_at_idx on public.transactions (created_at desc);

-- ----------------------------------------------------------------------------
-- profit_corrections — admin-only, append only, keeps full history
-- ----------------------------------------------------------------------------
create table if not exists public.profit_corrections (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete restrict,
  previous_profit numeric(14, 2) not null,
  corrected_profit numeric(14, 2) not null check (corrected_profit >= 0),
  reason text not null check (length(btrim(reason)) >= 3),
  admin_id uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists profit_corrections_transaction_idx
  on public.profit_corrections (transaction_id, created_at desc);

-- ============================================================================
-- IMMUTABILITY
-- Transactions and corrections are append-only at the database level, so no
-- API caller (including a logged-in admin hitting the REST API directly) can
-- edit or delete a recorded profit.
-- ============================================================================
create or replace function public.block_write()
returns trigger language plpgsql as $$
begin
  raise exception
    'السجلات المالية غير قابلة للتعديل أو الحذف (%.% / %)',
    tg_table_schema, tg_table_name, tg_op;
end;
$$;

drop trigger if exists transactions_no_update on public.transactions;
create trigger transactions_no_update
  before update on public.transactions
  for each row execute function public.block_write();

drop trigger if exists transactions_no_delete on public.transactions;
create trigger transactions_no_delete
  before delete on public.transactions
  for each row execute function public.block_write();

drop trigger if exists profit_corrections_no_update on public.profit_corrections;
create trigger profit_corrections_no_update
  before update on public.profit_corrections
  for each row execute function public.block_write();

drop trigger if exists profit_corrections_no_delete on public.profit_corrections;
create trigger profit_corrections_no_delete
  before delete on public.profit_corrections
  for each row execute function public.block_write();

-- A correction always snapshots the currently effective profit and is always
-- attributed to the signed-in admin, whatever the client sends.
create or replace function public.prepare_profit_correction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base numeric(14, 2);
  current_effective numeric(14, 2);
begin
  if not public.is_admin() then
    raise exception 'التصحيح متاح للمشرفين فقط';
  end if;

  select t.profit into base from public.transactions t where t.id = new.transaction_id;
  if base is null then
    raise exception 'المعاملة غير موجودة';
  end if;

  select coalesce(
           (select pc.corrected_profit
            from public.profit_corrections pc
            where pc.transaction_id = new.transaction_id
            order by pc.created_at desc, pc.id desc
            limit 1),
           base)
    into current_effective;

  new.previous_profit := current_effective;
  new.admin_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists profit_corrections_prepare on public.profit_corrections;
create trigger profit_corrections_prepare
  before insert on public.profit_corrections
  for each row execute function public.prepare_profit_correction();

-- ============================================================================
-- VIEWS (security_invoker: RLS of the underlying tables still applies)
-- ============================================================================
create or replace view public.transaction_details
with (security_invoker = true) as
select
  t.id,
  t.customer_id,
  c.full_name as customer_name,
  c.mobile as customer_mobile,
  c.nationality,
  c.city,
  t.service_name,
  t.profit as original_profit,
  coalesce(lc.corrected_profit, t.profit) as effective_profit,
  lc.corrected_profit,
  lc.reason as correction_reason,
  lc.created_at as corrected_at,
  (lc.id is not null) as is_corrected,
  t.note,
  t.created_at
from public.transactions t
join public.customers c on c.id = t.customer_id
left join lateral (
  select pc.id, pc.corrected_profit, pc.reason, pc.created_at
  from public.profit_corrections pc
  where pc.transaction_id = t.id
  order by pc.created_at desc, pc.id desc
  limit 1
) lc on true;

-- Customer list data. Deliberately excludes national_id.
create or replace view public.customer_summary
with (security_invoker = true) as
select
  c.id,
  c.full_name,
  c.mobile,
  c.nationality,
  c.city,
  c.district,
  c.created_at,
  coalesce(agg.transactions_count, 0)::int as transactions_count,
  coalesce(agg.total_profit, 0)::numeric(14, 2) as total_profit
from public.customers c
left join (
  select customer_id,
         count(*) as transactions_count,
         sum(effective_profit) as total_profit
  from public.transaction_details
  group by customer_id
) agg on agg.customer_id = c.id;

create or replace view public.customers_by_nationality
with (security_invoker = true) as
select nationality as label, count(*)::int as total
from public.customers
group by nationality
order by count(*) desc, nationality;

create or replace view public.customers_by_city
with (security_invoker = true) as
select city as label, count(*)::int as total
from public.customers
group by city
order by count(*) desc, city;

-- ============================================================================
-- REPORTING FUNCTIONS
-- ============================================================================
create or replace function public.dashboard_stats()
returns json language plpgsql stable set search_path = public as $$
declare
  tz text := public.app_timezone();
  today date := (timezone(tz, now()))::date;
  result json;
begin
  select json_build_object(
    'total_customers', (select count(*) from public.customers),
    'customers_today', (
      select count(*) from public.customers c
      where (timezone(tz, c.created_at))::date = today
    ),
    'total_transactions', (select count(*) from public.transactions),
    'transactions_today', (
      select count(*) from public.transactions t
      where (timezone(tz, t.created_at))::date = today
    ),
    'total_profit', (
      select coalesce(sum(td.effective_profit), 0) from public.transaction_details td
    ),
    'profit_today', (
      select coalesce(sum(td.effective_profit), 0) from public.transaction_details td
      where (timezone(tz, td.created_at))::date = today
    ),
    'profit_month', (
      select coalesce(sum(td.effective_profit), 0) from public.transaction_details td
      where date_trunc('month', (timezone(tz, td.created_at))::date)
            = date_trunc('month', today)
    )
  )
  into result;

  return result;
end;
$$;

create or replace function public.profit_report(
  p_from date default null,
  p_to date default null,
  p_customer_id uuid default null,
  p_nationality text default null,
  p_city text default null
)
returns json language plpgsql stable set search_path = public as $$
declare
  tz text := public.app_timezone();
  result json;
begin
  with f as (
    select td.customer_id, td.effective_profit
    from public.transaction_details td
    where (p_from is null or (timezone(tz, td.created_at))::date >= p_from)
      and (p_to is null or (timezone(tz, td.created_at))::date <= p_to)
      and (p_customer_id is null or td.customer_id = p_customer_id)
      and (p_nationality is null or td.nationality = p_nationality)
      and (p_city is null or td.city = p_city)
  )
  select json_build_object(
    'customers_count', (select count(distinct f2.customer_id) from f f2),
    'transactions_count', (select count(*) from f f3),
    'total_profit', (select coalesce(sum(f4.effective_profit), 0) from f f4)
  )
  into result;

  return result;
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.transactions enable row level security;
alter table public.profit_corrections enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- customers -----------------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using (public.is_member());

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (public.is_member()) with check (public.is_member());

-- Deleting a customer that has transactions is blocked by the FK (restrict),
-- so profits can never be hidden by removing the customer.
drop policy if exists customers_delete_admin on public.customers;
create policy customers_delete_admin on public.customers
  for delete to authenticated using (public.is_admin());

-- transactions --------------------------------------------------------------
-- SELECT + INSERT only. No UPDATE/DELETE policy exists, so RLS denies both.
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated using (public.is_member());

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());

-- profit_corrections --------------------------------------------------------
drop policy if exists profit_corrections_select on public.profit_corrections;
create policy profit_corrections_select on public.profit_corrections
  for select to authenticated using (public.is_member());

drop policy if exists profit_corrections_insert_admin on public.profit_corrections;
create policy profit_corrections_insert_admin on public.profit_corrections
  for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

-- ============================================================================
-- GRANTS — remove every write path that RLS alone would not cover
-- ============================================================================
revoke all on public.profiles, public.customers, public.transactions,
  public.profit_corrections from anon, authenticated;
revoke all on public.transaction_details, public.customer_summary,
  public.customers_by_nationality, public.customers_by_city from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert on public.transactions to authenticated;
grant select, insert on public.profit_corrections to authenticated;

grant select on public.transaction_details to authenticated;
grant select on public.customer_summary to authenticated;
grant select on public.customers_by_nationality to authenticated;
grant select on public.customers_by_city to authenticated;

revoke all on function public.dashboard_stats() from public, anon;
revoke all on function public.profit_report(date, date, uuid, text, text) from public, anon;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.profit_report(date, date, uuid, text, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member() to authenticated;

grant usage on schema public to authenticated;
