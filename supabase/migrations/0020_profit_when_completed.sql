-- Office profit counts only after the transaction is completed.

create or replace function public.dashboard_stats()
returns json language plpgsql stable set search_path = public as $$
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
    ),
    'total_profit', (
      select coalesce(sum(t.profit), 0) from public.transactions t
      where t.status = 'completed'
    ),
    'profit_today', (
      select coalesce(sum(t.profit), 0) from public.transactions t
      where t.status = 'completed'
        and (timezone(tz, t.created_at))::date = today
    ),
    'profit_month', (
      select coalesce(sum(t.profit), 0) from public.transactions t
      where t.status = 'completed'
        and (timezone(tz, t.created_at))::date >= month_start
        and (timezone(tz, t.created_at))::date < month_end
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
    where t.status = 'completed'
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
