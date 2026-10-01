-- ============================================================================
-- Stop profit corrections. Do not delete customers, transactions, or history.
-- Existing profit_corrections rows are kept. New ones cannot be created.
-- Reports use the profit saved on the transaction itself.
-- ============================================================================

-- Reject every new correction, including from the SQL editor / table owner.
create or replace function public.prepare_profit_correction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'لم يعد إنشاء تصحيحات الأرباح متاحاً';
end;
$$;

drop policy if exists profit_corrections_insert_admin on public.profit_corrections;

revoke insert on table public.profit_corrections from authenticated, anon;

-- Saved transaction profit is the only profit used in totals.
-- Column list stays the same so this replaces the existing view in place.
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
  t.profit as effective_profit,
  null::numeric(14, 2) as corrected_profit,
  null::text as correction_reason,
  null::timestamptz as corrected_at,
  false as is_corrected,
  t.note,
  t.created_at
from public.transactions t
join public.customers c on c.id = t.customer_id;

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
  select t.customer_id,
         count(t.id)::int as transactions_count,
         coalesce(sum(t.profit), 0)::numeric(14, 2) as total_profit
  from public.transactions t
  group by t.customer_id
) agg on agg.customer_id = c.id;

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
    'total_transactions', (select count(t.id) from public.transactions t),
    'transactions_today', (
      select count(t.id) from public.transactions t
      where (timezone(tz, t.created_at))::date = today
    ),
    'transactions_month', (
      select count(t.id) from public.transactions t
      where date_trunc('month', (timezone(tz, t.created_at))::date)
            = date_trunc('month', today)
    ),
    'total_profit', (select coalesce(sum(t.profit), 0) from public.transactions t),
    'profit_today', (
      select coalesce(sum(t.profit), 0) from public.transactions t
      where (timezone(tz, t.created_at))::date = today
    ),
    'profit_month', (
      select coalesce(sum(t.profit), 0) from public.transactions t
      where date_trunc('month', (timezone(tz, t.created_at))::date)
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
    select t.id, t.customer_id, t.profit
    from public.transactions t
    join public.customers c on c.id = t.customer_id
    where (p_from is null or (timezone(tz, t.created_at))::date >= p_from)
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
