-- ============================================================================
-- Each saved transaction is its own row.
-- Run this if 0001_init.sql was already applied.
-- It does not change customers, RLS, or the immutability triggers.
-- ============================================================================

comment on table public.transactions is
  'Append-only. Each insert is a new transaction even when service_name repeats for the same customer.';
comment on column public.transactions.service_name is
  'Not unique. Never used as an identity. Counts use count(id), never count(distinct service_name).';

-- A unique key on (customer_id, service_name) would reject or replace a repeated service.
do $$
declare
  idx record;
begin
  for idx in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.transactions'::regclass
      and con.contype = 'u'
  loop
    execute format('alter table public.transactions drop constraint %I', idx.conname);
  end loop;

  for idx in
    select ic.relname as index_name
    from pg_index ix
    join pg_class ic on ic.oid = ix.indexrelid
    where ix.indrelid = 'public.transactions'::regclass
      and ix.indisunique
      and not ix.indisprimary
  loop
    execute format('drop index if exists public.%I', idx.index_name);
  end loop;
end $$;

create or replace function public.assign_new_transaction_id()
returns trigger language plpgsql as $$
begin
  new.id := gen_random_uuid();
  return new;
end;
$$;

drop trigger if exists transactions_new_id on public.transactions;
create trigger transactions_new_id
  before insert on public.transactions
  for each row execute function public.assign_new_transaction_id();

-- One row per transaction id. Grouped only by customer, never by service_name.
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
  select td.customer_id,
         count(td.id)::int as transactions_count,
         coalesce(sum(td.effective_profit), 0)::numeric(14, 2) as total_profit
  from public.transaction_details td
  group by td.customer_id
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
    select td.id, td.customer_id, td.effective_profit
    from public.transaction_details td
    where (p_from is null or (timezone(tz, td.created_at))::date >= p_from)
      and (p_to is null or (timezone(tz, td.created_at))::date <= p_to)
      and (p_customer_id is null or td.customer_id = p_customer_id)
      and (p_nationality is null or td.nationality = p_nationality)
      and (p_city is null or td.city = p_city)
  )
  select json_build_object(
    'customers_count', (select count(distinct f.customer_id) from f),
    'transactions_count', (select count(f.id) from f),
    'total_profit', (select coalesce(sum(f.effective_profit), 0) from f)
  )
  into result;

  return result;
end;
$$;
