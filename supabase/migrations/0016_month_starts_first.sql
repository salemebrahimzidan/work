-- أرباح هذا الشهر تبدأ من أول يوم في الشهر بتوقيت الرياض
-- وتشمل حتى نهاية الشهر، ولا تشمل الشهر السابق.

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
    'total_profit', (select coalesce(sum(t.profit), 0) from public.transactions t),
    'profit_today', (
      select coalesce(sum(t.profit), 0) from public.transactions t
      where (timezone(tz, t.created_at))::date = today
    ),
    'profit_month', (
      select coalesce(sum(t.profit), 0) from public.transactions t
      where (timezone(tz, t.created_at))::date >= month_start
        and (timezone(tz, t.created_at))::date < month_end
    )
  )
  into result;

  return result;
end;
$$;
