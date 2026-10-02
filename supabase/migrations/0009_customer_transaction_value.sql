-- Customer list can show the sum of transaction amounts separately from office commission.
-- New columns are appended so the existing view is replaced in place.

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
  coalesce(agg.total_profit, 0)::numeric(14, 2) as total_profit,
  coalesce(agg.total_transaction_value, 0)::numeric(14, 2) as total_transaction_value
from public.customers c
left join (
  select t.customer_id,
         count(t.id)::int as transactions_count,
         coalesce(sum(t.profit), 0)::numeric(14, 2) as total_profit,
         coalesce(sum(t.transaction_value), 0)::numeric(14, 2) as total_transaction_value
  from public.transactions t
  group by t.customer_id
) agg on agg.customer_id = c.id;
