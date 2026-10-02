-- قيمة المعاملة is stored separately from عمولة المكتب.
-- profit remains the office commission and is still what profit reports sum.

alter table public.transactions
  add column if not exists transaction_value numeric(14, 2);

alter table public.transactions
  drop constraint if exists transactions_transaction_value_nonnegative;

alter table public.transactions
  add constraint transactions_transaction_value_nonnegative
  check (transaction_value is null or (transaction_value >= 0 and transaction_value <= 999999999999.99));

comment on column public.transactions.transaction_value is
  'قيمة المعاملة. Null on rows saved before this column existed.';

comment on column public.transactions.profit is
  'عمولة المكتب. This is the amount included in profit reports.';

create or replace function public.guard_transaction_update()
returns trigger language plpgsql as $$
begin
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
     or new.profit is null
     or new.profit < 0
  then
    raise exception 'لا يمكن تعديل غير عمولة المكتب';
  end if;

  return new;
end;
$$;

-- New columns can only be appended. Existing view columns stay in place.
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
  t.created_at,
  t.transaction_value
from public.transactions t
join public.customers c on c.id = t.customer_id;
