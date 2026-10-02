-- A new transaction starts pending. It can then be completed, or cancelled with a reason.
-- Rows saved before this change stay completed.

alter table public.transactions
  add column if not exists status text,
  add column if not exists cancel_reason text;

-- The immutability trigger rejects a normal UPDATE. Pause it only for this backfill.
alter table public.transactions disable trigger transactions_no_update;

update public.transactions
set status = 'completed'
where status is null;

alter table public.transactions enable trigger transactions_no_update;

alter table public.transactions
  alter column status set default 'pending';

alter table public.transactions
  alter column status set not null;

alter table public.transactions
  drop constraint if exists transactions_status_check;

alter table public.transactions
  add constraint transactions_status_check
  check (status in ('pending', 'completed', 'cancelled'));

alter table public.transactions
  drop constraint if exists transactions_cancel_reason_check;

alter table public.transactions
  add constraint transactions_cancel_reason_check
  check (
    (status = 'cancelled' and length(btrim(cancel_reason)) > 0)
    or (status <> 'cancelled' and cancel_reason is null)
  );

comment on column public.transactions.status is
  'pending when created, then completed or cancelled.';
comment on column public.transactions.cancel_reason is
  'Required when status is cancelled.';

create or replace function public.guard_transaction_update()
returns trigger language plpgsql as $$
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
    then
      raise exception 'لا يمكن تعديل غير حالة المعاملة';
    end if;

    if old.status is distinct from 'pending' then
      raise exception 'لا يمكن تغيير حالة معاملة منتهية';
    end if;

    if new.status not in ('completed', 'cancelled') then
      raise exception 'حالة المعاملة غير صحيحة';
    end if;

    if new.status = 'cancelled' and length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'سبب الإلغاء مطلوب';
    end if;

    if new.status = 'completed' then
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
     or new.profit is null
     or new.profit < 0
  then
    raise exception 'لا يمكن تعديل غير عمولة المكتب';
  end if;

  return new;
end;
$$;

create or replace function public.set_transaction_status(
  p_transaction_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  if p_status not in ('completed', 'cancelled') then
    raise exception 'حالة المعاملة غير صحيحة';
  end if;

  if p_status = 'cancelled' and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'سبب الإلغاء مطلوب';
  end if;

  perform set_config('app.transaction_status_update', 'on', true);

  update public.transactions
     set status = p_status,
         cancel_reason = case
           when p_status = 'cancelled' then btrim(p_reason)
           else null
         end
   where id = p_transaction_id;

  if not found then
    raise exception 'المعاملة غير موجودة';
  end if;
end;
$$;

revoke all on function public.set_transaction_status(uuid, text, text) from public, anon;
grant execute on function public.set_transaction_status(uuid, text, text) to authenticated;

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
  t.transaction_value,
  t.status,
  t.cancel_reason
from public.transactions t
join public.customers c on c.id = t.customer_id;
