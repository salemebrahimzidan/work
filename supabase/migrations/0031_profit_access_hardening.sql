-- Office profit and catalog commission are owner/admin only.
-- transaction_value stays readable by every active member.
-- Does not change tenant row policies, Reports, or platform-admin authority.
-- Run this file as one script. Do not apply it from the application.
--
-- Catalog transaction insert, every company role:
--   transactions.profit is replaced with services.commission for the active
--   company and service name. A caller-supplied profit is ignored.
--   A missing catalog commission raises a fixed message with no amount.
-- Unknown service name, every company role:
--   the insert is rejected. An unknown name is not a manual service.
-- Manual transaction insert:
--   owner/admin may store the submitted profit.
--   manager/user are rejected. The current form has no manual-fee workflow
--   for them, so the database fails closed.
-- Owner/admin still change an existing profit only through
-- admin_update_transaction_profit.

-- ----------------------------------------------------------------------------
-- Internal gate. Not an API function. Company comes from the session.
-- ----------------------------------------------------------------------------
create or replace function public.finance_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'لا تملك صلاحية عرض البيانات المالية';
  end if;

  v_company := public.current_company_id();
  if v_company is null
     or not public.is_company_member(v_company)
     or not public.has_company_role(v_company, array['owner', 'admin']) then
    raise exception 'لا تملك صلاحية عرض البيانات المالية';
  end if;

  return v_company;
end;
$$;

revoke all on function public.finance_company_id() from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- transactions.profit is not a directly selectable API column.
-- INSERT stays so a new row can store the fee. Direct UPDATE stays ungranted.
-- ----------------------------------------------------------------------------
revoke select on table public.transactions from public, anon, authenticated;

grant select (
  id,
  customer_id,
  service_name,
  note,
  created_by,
  created_at,
  transaction_value,
  status,
  cancel_reason,
  company_id
) on table public.transactions to authenticated;

-- ----------------------------------------------------------------------------
-- services.commission is not part of the shared catalog read.
-- transaction_value and the other operational columns stay readable.
-- ----------------------------------------------------------------------------
revoke select on table public.services from public, anon, authenticated;

grant select (
  id,
  name,
  transaction_value,
  manual,
  sort_order,
  category,
  steps,
  company_id
) on table public.services to authenticated;

-- ----------------------------------------------------------------------------
-- Shared transaction view. No profit column and no reference to profit.
-- ----------------------------------------------------------------------------
drop view if exists public.transaction_details;

create view public.transaction_details
with (security_invoker = true) as
select
  t.id,
  t.customer_id,
  c.full_name as customer_name,
  c.mobile as customer_mobile,
  c.nationality,
  c.city,
  t.service_name,
  t.note,
  t.created_at,
  t.transaction_value,
  t.status,
  t.cancel_reason
from public.transactions t
join public.customers c on c.id = t.customer_id;

revoke all on table public.transaction_details from public, anon, authenticated, service_role;
grant select on table public.transaction_details to authenticated;

-- ----------------------------------------------------------------------------
-- Shared customer summary. total_profit is gone. total_transaction_value stays.
-- ----------------------------------------------------------------------------
drop view if exists public.customer_summary;

create view public.customer_summary
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
  coalesce(agg.total_transaction_value, 0)::numeric(14, 2) as total_transaction_value,
  c.national_id
from public.customers c
left join (
  select
    t.customer_id,
    count(t.id)::int as transactions_count,
    coalesce(sum(t.transaction_value), 0)::numeric(14, 2) as total_transaction_value
  from public.transactions t
  group by t.customer_id
) agg on agg.customer_id = c.id;

revoke all on table public.customer_summary from public, anon, authenticated, service_role;
grant select on table public.customer_summary to authenticated;

-- ----------------------------------------------------------------------------
-- Operational counts only. Profit totals move to office_profit_totals().
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns json
language plpgsql
stable
set search_path = public
as $$
declare
  tz text := public.app_timezone();
  today date := (timezone(tz, now()))::date;
  month_start date := date_trunc('month', today)::date;
  month_end date := (month_start + interval '1 month')::date;
  result json;
begin
  select json_build_object(
    'total_customers', (select count(*) from public.customers),
    'customers_today', (
      select count(*) from public.customers c
      where (timezone(tz, c.created_at))::date = today
    ),
    'total_transactions', (select count(t.id) from public.transactions t),
    'transactions_today', (
      select count(t.id) from public.transactions t
      where (timezone(tz, t.created_at))::date = today
    ),
    'transactions_month', (
      select count(t.id) from public.transactions t
      where (timezone(tz, t.created_at))::date >= month_start
        and (timezone(tz, t.created_at))::date < month_end
    )
  )
  into result;

  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Completed office-profit totals for the active company. Asia/Riyadh dates.
-- ----------------------------------------------------------------------------
create or replace function public.office_profit_totals()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text := public.app_timezone();
  today date := (timezone(tz, now()))::date;
  month_start date := date_trunc('month', today)::date;
  month_end date := (month_start + interval '1 month')::date;
  v_company uuid;
  result json;
begin
  v_company := public.finance_company_id();

  select json_build_object(
    'total_profit', coalesce(sum(t.profit), 0),
    'profit_today', coalesce(sum(t.profit) filter (
      where (timezone(tz, t.created_at))::date = today
    ), 0),
    'profit_month', coalesce(sum(t.profit) filter (
      where (timezone(tz, t.created_at))::date >= month_start
        and (timezone(tz, t.created_at))::date < month_end
    ), 0)
  )
  into result
  from public.transactions t
  where t.company_id = v_company
    and t.status = 'completed';

  return result;
end;
$$;

-- Per-transaction office fee. Only id and profit, only the active company.
create or replace function public.transaction_office_profits()
returns table (id uuid, profit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.profit
  from public.transactions t
  where t.company_id = public.finance_company_id();
$$;

-- Catalog commission for service maintenance and the owner/admin transaction form.
create or replace function public.service_commissions()
returns table (id uuid, commission numeric)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.commission
  from public.services s
  where s.company_id = public.finance_company_id();
$$;

-- Filtered completed-profit report. Same arguments and Riyadh date rules.
-- SECURITY DEFINER, so the company predicate is required.
create or replace function public.profit_report(
  p_from date default null,
  p_to date default null,
  p_customer_id uuid default null,
  p_nationality text default null,
  p_city text default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text := public.app_timezone();
  v_company uuid;
  result json;
begin
  v_company := public.finance_company_id();

  with f as (
    select t.id, t.customer_id, t.profit
    from public.transactions t
    join public.customers c on c.id = t.customer_id
    where t.company_id = v_company
      and c.company_id = v_company
      and t.status = 'completed'
      and (p_from is null or (timezone(tz, t.created_at))::date >= p_from)
      and (p_to is null or (timezone(tz, t.created_at))::date <= p_to)
      and (p_customer_id is null or t.customer_id = p_customer_id)
      and (p_nationality is null or c.nationality = p_nationality)
      and (p_city is null or c.city = p_city)
  )
  select json_build_object(
    'customers_count', (select count(distinct f.customer_id) from f),
    'transactions_count', (select count(f.id) from f),
    'total_profit', (select coalesce(sum(f.profit), 0) from f)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.office_profit_totals() from public, anon, authenticated, service_role;
revoke all on function public.transaction_office_profits() from public, anon, authenticated, service_role;
revoke all on function public.service_commissions() from public, anon, authenticated, service_role;
revoke all on function public.profit_report(date, date, uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function public.office_profit_totals() to authenticated;
grant execute on function public.transaction_office_profits() to authenticated;
grant execute on function public.service_commissions() to authenticated;
grant execute on function public.profit_report(date, date, uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Legacy correction log was readable by every member. Owner/admin only now.
-- No insert policy is added.
-- ----------------------------------------------------------------------------
drop policy if exists profit_corrections_select on public.profit_corrections;
create policy profit_corrections_select on public.profit_corrections
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- Catalog fee is copied here so manager/user never need to read commission.
-- Runs after transactions_assign_company, which sets company_id.
-- Name order: transactions_assign_company, then transactions_copy_catalog_profit.
-- Unknown names are rejected. Manual profit is owner/admin only.
-- ----------------------------------------------------------------------------
create or replace function public.transactions_copy_catalog_profit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manual boolean;
  v_commission numeric(14, 2);
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.company_id is null then
    raise exception 'العميل غير موجود';
  end if;

  select s.manual, s.commission
    into v_manual, v_commission
  from public.services s
  where s.company_id = new.company_id
    and s.name = new.service_name;

  if not found then
    raise exception 'الخدمة غير موجودة';
  end if;

  if not v_manual then
    if v_commission is null then
      raise exception 'سعر هذه الخدمة غير محدد في النظام';
    end if;
    new.profit := round(v_commission, 2);
    return new;
  end if;

  if not public.has_company_role(new.company_id, array['owner', 'admin']) then
    raise exception 'لا تملك صلاحية إتمام هذه المعاملة';
  end if;

  if new.profit is null or new.profit < 0 or new.profit > 999999999999.99 then
    raise exception 'قيمة المعاملة غير مكتملة';
  end if;

  new.profit := round(new.profit, 2);
  return new;
end;
$$;

revoke all on function public.transactions_copy_catalog_profit() from public, anon, authenticated, service_role;

drop trigger if exists transactions_copy_catalog_profit on public.transactions;
create trigger transactions_copy_catalog_profit
  before insert on public.transactions
  for each row execute function public.transactions_copy_catalog_profit();
