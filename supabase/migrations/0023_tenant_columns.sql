-- Attach existing business rows to الإيمان روح الذهبية.
-- Does not replace business RLS, profiles.role, memberships, profits, or statuses.
-- Run this file as one script so the whole change commits or rolls back together.

-- Volatile on purpose: a volatile default rewrites each table and stores company_id
-- without firing row triggers. Immutability triggers therefore stay enabled.
create or replace function public.backfill_company_id()
returns uuid
language sql
volatile
set search_path = public
as $$
  select c.id
  from public.companies c
  where c.name = 'الإيمان روح الذهبية'
  order by c.created_at, c.id
  limit 1
$$;

revoke all on function public.backfill_company_id() from public, anon, authenticated, service_role;

do $$
declare
  v_company_id uuid;
  v_table text;
begin
  v_company_id := public.backfill_company_id();
  if v_company_id is null then
    raise exception 'الشركة الإيمان روح الذهبية غير موجودة';
  end if;

  foreach v_table in array array[
    'customers',
    'services',
    'transactions',
    'profit_corrections',
    'transaction_profit_changes',
    'transaction_deletions'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'company_id'
    ) then
      raise exception 'company_id already exists on %', v_table;
    end if;

    execute format(
      'alter table public.%I add column company_id uuid not null default public.backfill_company_id() references public.companies (id) on delete restrict',
      v_table
    );
    execute format(
      'alter table public.%I alter column company_id drop default',
      v_table
    );
    execute format(
      'comment on column public.%I.company_id is %L',
      v_table,
      'Owning company. Set by the database, then frozen.'
    );
    execute format(
      'create index %I on public.%I (company_id)',
      v_table || '_company_id_idx',
      v_table
    );
  end loop;

  if exists (select 1 from public.customers where company_id is distinct from v_company_id)
     or exists (select 1 from public.services where company_id is distinct from v_company_id)
     or exists (select 1 from public.transactions where company_id is distinct from v_company_id)
     or exists (select 1 from public.profit_corrections where company_id is distinct from v_company_id)
     or exists (select 1 from public.transaction_profit_changes where company_id is distinct from v_company_id)
     or exists (select 1 from public.transaction_deletions where company_id is distinct from v_company_id)
  then
    raise exception 'company_id backfill did not attach every row to the first company';
  end if;
end $$;

drop function public.backfill_company_id();

-- ----------------------------------------------------------------------------
-- Service names stay unique inside one company and may repeat in another.
-- The old constraint is services_name_key on (name) from 0008.
-- ----------------------------------------------------------------------------
alter table public.services drop constraint if exists services_name_key;

alter table public.services
  add constraint services_company_name_key unique (company_id, name);

-- ----------------------------------------------------------------------------
-- Mobiles stay unique inside one company. Historical duplicates in this
-- company are kept, matching 0005: the unique index is created only when
-- the current rows have no duplicate inside a company.
-- ----------------------------------------------------------------------------
drop index if exists public.customers_mobile_normalized_key;
drop index if exists public.customers_mobile_normalized_idx;

create index customers_company_mobile_idx
  on public.customers (company_id, mobile_normalized);

do $$
begin
  if not exists (
    select 1
    from public.customers
    group by company_id, mobile_normalized
    having count(*) > 1
  ) then
    drop index if exists public.customers_company_mobile_idx;
    create unique index customers_company_mobile_key
      on public.customers (company_id, mobile_normalized);
  end if;
end $$;

-- A transaction cannot point at another company's customer.
alter table public.customers
  add constraint customers_id_company_key unique (id, company_id);

alter table public.transactions
  add constraint transactions_customer_company_fkey
  foreign key (customer_id, company_id)
  references public.customers (id, company_id);

-- ----------------------------------------------------------------------------
-- company_id is assigned here and cannot be taken from the client.
-- ----------------------------------------------------------------------------
create or replace function public.guard_customer_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.company_id := old.company_id;
  return new;
end;
$$;

create or replace function public.customers_guard_mobile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized text;
begin
  if tg_op = 'INSERT' then
    new.company_id := public.current_company_id();
    if new.company_id is null then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
  else
    new.company_id := old.company_id;
  end if;

  normalized := coalesce(nullif(public.normalize_mobile(new.mobile), ''), btrim(new.mobile));
  if normalized is null or length(normalized) = 0 then
    raise exception 'رقم الجوال غير صحيح';
  end if;

  new.mobile_normalized := normalized;

  if tg_op = 'INSERT' or new.mobile_normalized is distinct from old.mobile_normalized then
    if exists (
      select 1
      from public.customers c
      where c.company_id = new.company_id
        and c.mobile_normalized = new.mobile_normalized
        and c.id is distinct from new.id
    ) then
      raise exception 'هذا العميل مسجل مسبقًا';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_service_company()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.company_id := public.current_company_id();
    if new.company_id is null then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
    return new;
  end if;

  new.company_id := old.company_id;
  return new;
end;
$$;

drop trigger if exists services_guard_company on public.services;
create trigger services_guard_company
  before insert or update on public.services
  for each row execute function public.guard_service_company();

create or replace function public.transactions_assign_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  customer_company uuid;
begin
  select c.company_id
    into customer_company
  from public.customers c
  where c.id = new.customer_id;

  if customer_company is null then
    raise exception 'العميل غير موجود';
  end if;

  if auth.uid() is not null
     and customer_company is distinct from public.current_company_id() then
    raise exception 'لا يمكن ربط المعاملة بعميل من شركة أخرى';
  end if;

  new.company_id := customer_company;
  return new;
end;
$$;

drop trigger if exists transactions_assign_company on public.transactions;
create trigger transactions_assign_company
  before insert on public.transactions
  for each row execute function public.transactions_assign_company();

create or replace function public.guard_transaction_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.transaction_status_update', true) = 'on' then
    if new.id is distinct from old.id
       or new.customer_id is distinct from old.customer_id
       or new.service_name is distinct from old.service_name
       or new.note is distinct from old.note
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.transaction_value is distinct from old.transaction_value
       or new.profit is distinct from old.profit
       or new.company_id is distinct from old.company_id
    then
      raise exception 'لا يمكن تعديل غير حالة المعاملة';
    end if;

    if old.status = 'pending' then
      if new.status not in ('in_progress', 'cancelled') then
        raise exception 'المعاملة قيد الانتظار يمكن نقلها إلى قيد التنفيذ أو إلغاؤها فقط';
      end if;
    elsif old.status = 'in_progress' then
      if new.status not in ('completed', 'cancelled') then
        raise exception 'حالة المعاملة غير صحيحة';
      end if;
    else
      raise exception 'لا يمكن تغيير حالة معاملة منتهية';
    end if;

    if new.status = 'cancelled' and length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'سبب الإلغاء مطلوب';
    end if;

    if new.status <> 'cancelled' then
      new.cancel_reason := null;
    end if;

    return new;
  end if;

  if current_setting('app.admin_profit_update', true) is distinct from 'on' then
    raise exception
      'السجلات المالية غير قابلة للتعديل أو الحذف (%.% / %)',
      tg_table_schema, tg_table_name, tg_op;
  end if;

  if new.id is distinct from old.id
     or new.customer_id is distinct from old.customer_id
     or new.service_name is distinct from old.service_name
     or new.note is distinct from old.note
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.transaction_value is distinct from old.transaction_value
     or new.status is distinct from old.status
     or new.cancel_reason is distinct from old.cancel_reason
     or new.company_id is distinct from old.company_id
     or new.profit is null
     or new.profit < 0
  then
    raise exception 'لا يمكن تعديل غير عمولة المكتب';
  end if;

  return new;
end;
$$;

create or replace function public.audit_assign_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_company uuid;
begin
  select t.company_id
    into owner_company
  from public.transactions t
  where t.id = new.transaction_id;

  if owner_company is null then
    raise exception 'المعاملة غير موجودة';
  end if;

  if auth.uid() is not null
     and owner_company is distinct from public.current_company_id() then
    raise exception 'لا تملك صلاحية هذه الشركة';
  end if;

  new.company_id := owner_company;
  return new;
end;
$$;

drop trigger if exists profit_corrections_assign_company on public.profit_corrections;
create trigger profit_corrections_assign_company
  before insert on public.profit_corrections
  for each row execute function public.audit_assign_company();

drop trigger if exists transaction_profit_changes_assign_company on public.transaction_profit_changes;
create trigger transaction_profit_changes_assign_company
  before insert on public.transaction_profit_changes
  for each row execute function public.audit_assign_company();

drop trigger if exists transaction_deletions_assign_company on public.transaction_deletions;
create trigger transaction_deletions_assign_company
  before insert on public.transaction_deletions
  for each row execute function public.audit_assign_company();

revoke all on function public.guard_service_company() from public, anon, service_role;
revoke all on function public.transactions_assign_company() from public, anon, service_role;
revoke all on function public.audit_assign_company() from public, anon, service_role;
grant execute on function public.guard_service_company() to authenticated;
grant execute on function public.transactions_assign_company() to authenticated;
grant execute on function public.audit_assign_company() to authenticated;
